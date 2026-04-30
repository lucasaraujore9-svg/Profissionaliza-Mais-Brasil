import type { UserRole } from "@prisma/client"

// Extensão do NextAuth para incluir role e tenantId no JWT/session
declare module "next-auth" {
  interface User {
    role: UserRole
    tenantId: string | null
    studentId?: string | null
  }
}

// API Response padrão
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
