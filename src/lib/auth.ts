import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { compare } from "bcryptjs"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { authSecret } from "@/lib/env"
import { rateLimitByKey, RATE_LIMITS } from "@/lib/ratelimit"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import "@/types"

// O campo `email` aceita email OU CPF (aluno). A distinção é feita no
// authorize: com "@" valida como email (User + Student); sem "@" e com CPF
// válido, autentica só como Student (User não tem CPF).
const loginSchema = z.object({
  email: z.string().trim().min(3).max(160),
  password: z.string().min(6),
})

/**
 * Resolve o tenant ativo a partir dos headers preenchidos pelo proxy:
 *   - x-tenant-id (preferido)
 *   - x-tenant-slug (fallback — consulta o DB)
 *   - sem headers → vitrine PMB (tenant placeholder `__pmb__`)
 *
 * Usado para escopar o login do aluno: cada subdomínio só autoriza
 * Students daquele tenant.
 */
async function resolveTenantIdFromRequest(
  request: Request | undefined,
): Promise<string | null> {
  const tenantId = request?.headers?.get?.("x-tenant-id") ?? null
  if (tenantId) return tenantId

  const tenantSlug = request?.headers?.get?.("x-tenant-slug") ?? null
  if (tenantSlug) {
    const t = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    })
    if (t) return t.id
  }

  // Sem subdomínio: usa o tenant placeholder PMB (vendas direto na vitrine
  // principal). Se ainda não existe (seed não rodou), retorna null e o
  // login do aluno cai para o fallback global.
  const pmbTenant = await prisma.tenant.findUnique({
    where: { slug: PMB_TENANT_SLUG },
    select: { id: true },
  })
  return pmbTenant?.id ?? null
}

const isProd = process.env.NODE_ENV === "production"

// Em produção, NextAuth lança se `secret` for undefined; em dev gera um
// secret efêmero e loga warning. `authSecret()` mantém compat com AUTH_SECRET
// (v5) e NEXTAUTH_SECRET (legado) — validação forte está em src/lib/env.ts.
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret(),
  trustHost: true,
  session: { strategy: "jwt" },
  // Explicit cookie hardening — defaults do NextAuth v5 já são seguros, mas
  // declarar evita regressões silenciosas e documenta o intent.
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        // Identificador: email (contém "@") ou CPF do aluno (11 dígitos
        // válidos). Qualquer outra coisa é rejeitada antes de tocar o banco.
        const identifier = parsed.data.email
        const isEmailLogin = identifier.includes("@")
        const cpfDigits = stripCpf(identifier)
        const isCpfLogin = !isEmailLogin && isValidCpf(cpfDigits)
        if (isEmailLogin) {
          if (!z.string().email().safeParse(identifier).success) return null
        } else if (!isCpfLogin) {
          return null
        }

        // Rate-limit anti-brute-force: chave por IP + email lower-case.
        // Bucket único pra User e Student — bloqueia tentativas vs ambos.
        // Falha em modo aberto se o Redis não estiver configurado (dev).
        const ipHint =
          request?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ??
          request?.headers?.get?.("x-real-ip") ??
          "anon"
        const rlKey = `${ipHint}:${isCpfLogin ? cpfDigits : identifier.toLowerCase()}`
        const rl = await rateLimitByKey(rlKey, RATE_LIMITS.authLogin)
        if (!rl.ok) {
          // NextAuth não tem 429 nativo no Credentials provider — retornar
          // null devolve "credentials inválido", o que é OK do ponto de
          // vista de UX e segurança (não revela rate-limit ao atacante).
          contextLogger().warn(
            { event: "auth.rate_limit", identifier, ipHint },
            "rate-limit de login",
          )
          return null
        }

        // 1) Tenta como User (admin/equipe/revendedor) — só por email; User
        // não tem CPF, então login por CPF pula direto para o aluno.
        const user = isEmailLogin
          ? await prisma.user.findUnique({
              where: { email: identifier },
              include: { tenant: true },
            })
          : null

        if (user) {
          const isValid = await compare(parsed.data.password, user.passwordHash)
          if (!isValid) return null

          // Bloqueia login de usuário INATIVO/PENDING_INVITE — só ATIVO.
          if (user.status !== "ATIVO") return null

          // Consultor convidado por revendedor: o User e criado com
          // role=RESELLER mas SEM tenantId direto — o vinculo vive em
          // TenantMember. Buscamos a membership ativa para popular tenantId
          // no JWT, caso contrario requireResellerSession sempre rejeita.
          let effectiveTenantId = user.tenantId
          let effectiveTenantStatus = user.tenant?.status ?? null
          let memberRole: "owner" | "consultant" | null =
            user.tenantId ? "owner" : null

          if (!effectiveTenantId && user.role === "RESELLER") {
            const membership = await prisma.tenantMember.findFirst({
              where: { userId: user.id, status: "ATIVO" },
              include: { tenant: { select: { id: true, status: true } } },
              orderBy: { createdAt: "asc" },
            })
            if (membership?.tenant) {
              effectiveTenantId = membership.tenant.id
              effectiveTenantStatus = membership.tenant.status
              memberRole = "consultant"
            }
          }

          // RESELLER (owner ou consultor) só pode logar se o tenant estiver
          // ACTIVE ou PENDING (PENDING = aguardando 1º pagamento mas pode
          // configurar a loja). CANCELLED/SUSPENDED bloqueiam acesso.
          // Roles PMB (SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR) não dependem
          // de tenant — passam direto.
          if (user.role === "RESELLER") {
            if (!effectiveTenantId) return null
            if (
              effectiveTenantStatus !== "ACTIVE" &&
              effectiveTenantStatus !== "PENDING"
            ) {
              return null
            }
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: effectiveTenantId,
            studentId: null,
            mustChangePassword: user.mustChangePassword,
            tenantStatus: effectiveTenantStatus,
            memberRole,
          }
        }

        // 2) Login do aluno — escopado pelo tenant do subdomínio atual.
        // O mesmo email pode existir em vários tenants (cada loja gera um
        // Student separado); só autorizamos o da loja onde o usuário está
        // tentando logar.
        const targetTenantId = await resolveTenantIdFromRequest(request)
        if (!targetTenantId) return null

        const student = await prisma.student.findFirst({
          where: {
            ...(isCpfLogin ? { cpf: cpfDigits } : { email: identifier }),
            tenantId: targetTenantId,
            passwordHash: { not: null },
          },
          select: {
            id: true,
            nome: true,
            email: true,
            passwordHash: true,
            tenantId: true,
            status: true,
          },
        })

        if (!student?.passwordHash || !student.email) return null

        const isValid = await compare(parsed.data.password, student.passwordHash)
        if (!isValid) return null

        // Bloqueia login de aluno suspenso (BLOQUEADO) ou desativado (INATIVO).
        // ATIVO, DEVEDOR (pra resolver pagamento), FORMADO, INTERESSADO podem logar.
        if (student.status === "BLOQUEADO" || student.status === "INATIVO") {
          return null
        }

        await prisma.student
          .update({
            where: { id: student.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(swallow("auth.lastLogin"))

        return {
          id: student.id,
          email: student.email,
          name: student.nome,
          role: "STUDENT",
          tenantId: student.tenantId,
          studentId: student.id,
          mustChangePassword: false,
        }
      },
    }),
  ],
  callbacks: {
    // Tipos extendidos vivem em src/types/index.ts (declare module). Isso
    // elimina os `as unknown as` que existiam aqui antes.
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.tenantId = user.tenantId
        token.studentId = user.studentId ?? null
        token.mustChangePassword = user.mustChangePassword ?? false
        token.tenantStatus = user.tenantStatus ?? null
        token.memberRole = user.memberRole ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.id
        session.user.role = token.role ?? session.user.role
        session.user.tenantId = token.tenantId ?? null
        session.user.studentId = token.studentId ?? null
        session.user.mustChangePassword = token.mustChangePassword ?? false
        session.user.tenantStatus = token.tenantStatus ?? null
        session.user.memberRole = token.memberRole ?? null
      }
      return session
    },
  },
  // Events emitem ao stream estruturado de Pino — permite que dataset
  // externo (Axiom/Datadog) indexe `event:audit.auth.*` para investigação
  // de incidentes (brute-force, conta comprometida, login anômalo).
  events: {
    async signIn({ user }) {
      const u = user as {
        id?: string
        role?: string
        email?: string
        tenantId?: string | null
        studentId?: string | null
      }
      contextLogger().info(
        {
          event: "audit.auth.signin",
          userId: u.id ?? null,
          role: u.role ?? null,
          email: u.email ?? null,
          tenantId: u.tenantId ?? null,
          studentId: u.studentId ?? null,
        },
        "auth: login bem-sucedido",
      )
    },
    async signOut(message) {
      // SignOutMessage tem `token` (JWT strategy) ou `session` (database).
      // Suportamos JWT — pegamos `sub` do token.
      const m = message as { token?: { sub?: string; role?: string } }
      contextLogger().info(
        {
          event: "audit.auth.signout",
          userId: m.token?.sub ?? null,
          role: m.token?.role ?? null,
        },
        "auth: logout",
      )
    },
  },
})
