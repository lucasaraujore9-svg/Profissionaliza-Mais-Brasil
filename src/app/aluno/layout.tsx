import { redirect } from "next/navigation"
import { requireStudentSession } from "@/lib/auth/student-session"
import { StudentShell } from "@/components/aluno/student-shell"

export default async function AlunoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireStudentSession()
  if (!session) {
    redirect("/login")
  }
  return <StudentShell session={session}>{children}</StudentShell>
}
