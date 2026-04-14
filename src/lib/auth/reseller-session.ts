import { auth } from "@/lib/auth"

export interface ResellerSession {
  userId: string
  tenantId: string
}

export async function requireResellerSession(): Promise<ResellerSession | null> {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    return null
  }
  return {
    userId: session.user.id as string,
    tenantId: session.user.tenantId as string,
  }
}
