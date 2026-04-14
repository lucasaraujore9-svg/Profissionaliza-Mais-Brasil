import { auth } from "@/lib/auth"

export interface AdminSession {
  userId: string
  role: "SUPER_ADMIN" | "ADMIN"
}

export async function requireAdminSession(): Promise<AdminSession | null> {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || (role !== "SUPER_ADMIN" && role !== "ADMIN")) {
    return null
  }
  return {
    userId: session.user.id as string,
    role: role as "SUPER_ADMIN" | "ADMIN",
  }
}
