import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { compare } from "bcryptjs"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

// Erro customizado para tenant inativo (PENDING ou SUSPENDED)
class TenantNotActiveError extends CredentialsSignin {
  code = "tenant_not_active"
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
      async authorize(credentials) {
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

          // Revendedores com tenant PENDING ou SUSPENDED não podem acessar
          if (
            user.role === "RESELLER" &&
            user.tenant &&
            (user.tenant.status === "PENDING" || user.tenant.status === "SUSPENDED")
          ) {
            throw new TenantNotActiveError()
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId,
            studentId: null,
            mustChangePassword: user.mustChangePassword,
          }
        }

        // 2) Fallback: aluno com senha definida. Student.email pode existir
        // em multiplos tenants; pega o primeiro com passwordHash populado.
        const student = await prisma.student.findFirst({
          where: {
            email: parsed.data.email,
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
      }
      return session
    },
  },
})
