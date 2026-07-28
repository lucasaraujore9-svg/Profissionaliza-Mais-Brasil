import type { UserRole } from "@prisma/client"
import type { PainelMemberRole } from "@/lib/auth/painel-permissions"

/**
 * Tipos compartilhados pela sessão NextAuth.
 *
 * Centralizar aqui evita o anti-padrão `(session.user as unknown as { ... })`
 * espalhado pelo app. Atualizar este arquivo + auth.ts garante que todos
 * os consumidores vejam o shape correto.
 */
/**
 * Papel do usuário DENTRO da unidade (revenda). `null` para quem não é da
 * revenda (equipe PMB, aluno). As permissões efetivas NÃO vivem no token — são
 * resolvidas por request em `lib/auth/painel-guard.ts`, para que uma mudança de
 * papel não fique presa num JWT velho.
 */
type MemberRole = PainelMemberRole | null

declare module "next-auth" {
  interface User {
    role: UserRole | "STUDENT"
    tenantId: string | null
    studentId?: string | null
    mustChangePassword?: boolean
    tenantStatus?: string | null
    memberRole?: MemberRole
  }

  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: UserRole | "STUDENT"
      tenantId: string | null
      studentId: string | null
      mustChangePassword: boolean
      tenantStatus: string | null
      memberRole: MemberRole
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole | "STUDENT"
    tenantId?: string | null
    studentId?: string | null
    mustChangePassword?: boolean
    tenantStatus?: string | null
    memberRole?: MemberRole
    // Epoch ms da última re-sincronização do token com o banco (throttle no
    // callback jwt). Ausente em tokens antigos → força refresh no 1º acesso.
    refreshedAt?: number
  }
}

// API Response padrão (mantido para compat — preferir helper apiResponse de src/lib/api/response.ts)
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}

// Dados do tenant resolvido pelo middleware
export interface ResolvedTenant {
  id: string
  slug: string
  name: string
  customDomain: string | null
  status: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string | null
}
