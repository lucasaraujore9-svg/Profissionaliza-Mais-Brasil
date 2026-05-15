import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { compare } from "bcryptjs"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

const loginSchema = z.object({
  email: z.string().email(),
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
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

        // 1) Tenta como User (admin/equipe/revendedor)
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { tenant: true },
        })

        if (user) {
          const isValid = await compare(parsed.data.password, user.passwordHash)
          if (!isValid) return null

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId,
            studentId: null,
            mustChangePassword: user.mustChangePassword,
            tenantStatus: user.tenant?.status ?? null,
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
            email: parsed.data.email,
            tenantId: targetTenantId,
            passwordHash: { not: null },
          },
          select: {
            id: true,
            nome: true,
            email: true,
            passwordHash: true,
            tenantId: true,
          },
        })

        if (!student?.passwordHash || !student.email) return null

        const isValid = await compare(parsed.data.password, student.passwordHash)
        if (!isValid) return null

        await prisma.student
          .update({
            where: { id: student.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => undefined)

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
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role
        token.tenantId = (user as { tenantId: string | null }).tenantId
        token.studentId =
          (user as { studentId?: string | null }).studentId ?? null
        token.mustChangePassword =
          (user as { mustChangePassword?: boolean }).mustChangePassword ?? false
        token.tenantStatus =
          (user as { tenantStatus?: string | null }).tenantStatus ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        ;(session.user as { role: string }).role = token.role as string
        ;(session.user as { tenantId: string | null }).tenantId =
          token.tenantId as string | null
        ;(session.user as { studentId: string | null }).studentId =
          (token.studentId as string | null | undefined) ?? null
        ;(session.user as unknown as { mustChangePassword: boolean }).mustChangePassword =
          (token.mustChangePassword as boolean | undefined) ?? false
        ;(session.user as unknown as { tenantStatus: string | null }).tenantStatus =
          (token.tenantStatus as string | null | undefined) ?? null
      }
      return session
    },
  },
})
