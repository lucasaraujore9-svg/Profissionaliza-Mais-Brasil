import { auth } from "@/lib/auth"
import type { UserRole } from "@prisma/client"

export interface AdminSession {
  userId: string
  role: UserRole
  name?: string
  email?: string
}

const PMB_TEAM: UserRole[] = [
  "SUPER_ADMIN",
  "PMB_SALES",
  "PMB_SALES_MGR",
  "PMB_REVENDA_SALES",
  "PMB_RESELLER_MGR",
  "PMB_FINANCEIRO",
]

/**
 * Aceita qualquer papel da equipe interna PMB.
 * Use guards.ts (requireSuperAdmin / requirePmbSales / requirePmbResellerMgr)
 * quando precisar de papel especifico.
 */
export async function requireAdminSession(): Promise<AdminSession | null> {
  const session = await auth()
  const user = session?.user as
    | { id?: string; role?: UserRole; name?: string; email?: string }
    | undefined
  if (!user?.id || !user.role || !PMB_TEAM.includes(user.role)) return null
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  }
}
