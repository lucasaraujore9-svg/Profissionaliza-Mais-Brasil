import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import type { UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { compare } from "bcryptjs"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { authSecret } from "@/lib/env"
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookies"
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

type UserSessionFields = {
  id: string
  email: string
  name: string
  role: UserRole
  tenantId: string | null
  studentId: null
  mustChangePassword: boolean
  tenantStatus: string | null
  memberRole: "owner" | "consultant" | null
}

/**
 * Monta os campos de sessão de um User interno/revendedor a partir do banco.
 *
 * Fonte única de verdade usada tanto no login (`authorize`) quanto na
 * re-sincronização do JWT (callback `jwt`). Isso garante que promover/rebaixar
 * papel (ex.: PMB_SALES → SUPER_ADMIN), desativar usuário ou trocar tenant
 * reflita na sessão sem exigir novo login.
 *
 * Retorna `null` quando o acesso deve ser negado:
 *   - usuário inexistente ou com status != ATIVO (desativado/convite pendente)
 *   - RESELLER sem tenant ATIVO/PENDING — só quando `enforceResellerTenant`
 *     (login). No refresh do JWT passamos `false`: não deslogamos uma revenda
 *     por suspensão de cobrança (os guards de rota já tratam tenantStatus),
 *     apenas mantemos os campos atualizados.
 */
async function loadUserSessionFields(
  userId: string,
  { enforceResellerTenant = true }: { enforceResellerTenant?: boolean } = {},
): Promise<UserSessionFields | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  })
  if (!user || user.status !== "ATIVO") return null

  // Consultor convidado por revendedor: User com role=RESELLER mas SEM
  // tenantId direto — o vínculo vive em TenantMember. Resolvemos a membership
  // ativa para popular tenantId, senão requireResellerSession sempre rejeita.
  let effectiveTenantId = user.tenantId
  let effectiveTenantStatus = user.tenant?.status ?? null
  let memberRole: "owner" | "consultant" | null = user.tenantId ? "owner" : null

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

  if (user.role === "RESELLER" && enforceResellerTenant) {
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
      name: SESSION_COOKIE_NAME,
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
        // Match case-insensitive: o email pode ter sido gravado com
        // capitalização diferente da digitada (Postgres `=` é case-sensitive).
        const user = isEmailLogin
          ? await prisma.user.findFirst({
              where: { email: { equals: identifier, mode: "insensitive" } },
              select: { id: true, passwordHash: true, status: true },
            })
          : null

        // O mesmo email pode pertencer a um User (admin/equipe/revendedor) E a
        // um Student de alguma loja — ex.: a dona da revenda (SUPER_ADMIN) que
        // também comprou um curso na própria vitrine. Por isso só retornamos
        // aqui quando a senha do User confere, ele está ATIVO e é elegível;
        // qualquer falha CAI para a tentativa de Student (escopada ao tenant)
        // em vez de abortar o login. Sem esse fallthrough a conta User
        // "sombreia" a de aluno e só o login por CPF funcionava.
        if (user && user.status === "ATIVO") {
          const isValid = await compare(parsed.data.password, user.passwordHash)
          if (isValid) {
            // Campos de sessão (papel, tenant, memberRole) vêm da fonte única.
            // Ela também aplica a regra de RESELLER precisar de tenant
            // ACTIVE/PENDING — retorna null caso contrário; nesse caso ainda
            // tentamos autenticar como aluno antes de desistir. Roles PMB
            // (SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR) não dependem de tenant.
            const fields = await loadUserSessionFields(user.id)
            if (fields) return fields
          }
        }

        // 2) Login do aluno — escopado pelo tenant do subdomínio atual.
        // O mesmo email pode existir em vários tenants (cada loja gera um
        // Student separado); só autorizamos o da loja onde o usuário está
        // tentando logar.
        const targetTenantId = await resolveTenantIdFromRequest(request)
        if (!targetTenantId) return null

        // Match de email case-insensitive: alunos cadastrados com email em
        // capitalização diferente da digitada não devem falhar o login (o CPF,
        // sendo só dígitos, nunca teve esse problema — por isso só ele funcionava).
        const student = await prisma.student.findFirst({
          where: {
            ...(isCpfLogin
              ? { cpf: cpfDigits }
              : { email: { equals: identifier, mode: "insensitive" } }),
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
        token.refreshedAt = Date.now()
        return token
      }

      // Sessão já estabelecida (sem `user`): re-sincroniza papel/status/tenant
      // do banco para que mudanças feitas por um admin (promover a SUPER_ADMIN,
      // rebaixar, desativar, trocar tenant) tenham efeito sem novo login.
      // Throttle de 60s evita uma query por request. Só Users internos/revenda
      // passam aqui — Student não muda de papel.
      if (token.sub && !token.studentId) {
        const last =
          typeof token.refreshedAt === "number" ? token.refreshedAt : 0
        if (Date.now() - last > 60_000) {
          try {
            const fresh = await loadUserSessionFields(token.sub, {
              enforceResellerTenant: false,
            })
            if (!fresh) {
              // Usuário inexistente ou desativado: invalida a sessão.
              // Auth.js v5 aceita retorno null no callback jwt.
              return null
            }
            token.role = fresh.role
            token.tenantId = fresh.tenantId
            token.mustChangePassword = fresh.mustChangePassword
            token.tenantStatus = fresh.tenantStatus
            token.memberRole = fresh.memberRole
            token.refreshedAt = Date.now()
          } catch {
            // Erro transitório no banco: mantém o token atual e tenta de novo
            // no próximo ciclo — não desloga por falha de infraestrutura.
          }
        }
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
