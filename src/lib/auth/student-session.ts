import { auth } from "@/lib/auth"

export interface StudentSession {
  studentId: string
  email: string
  name?: string
  tenantId: string | null
}

export async function requireStudentSession(): Promise<StudentSession | null> {
  const session = await auth()
  const user = session?.user as
    | {
        id?: string
        role?: string
        email?: string
        name?: string
        tenantId?: string | null
        studentId?: string | null
      }
    | undefined
  if (!user || user.role !== "STUDENT" || !user.studentId || !user.email) {
    return null
  }
  return {
    studentId: user.studentId,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId ?? null,
  }
}
