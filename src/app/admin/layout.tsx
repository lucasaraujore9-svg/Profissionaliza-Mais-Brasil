import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { auth } from "@/lib/auth"
import { AdminLayoutShell } from "./layout-shell"

export const metadata: Metadata = {
  title: "Admin | Profissionaliza Mais Brasil",
  description: "Painel administrativo do Profissionaliza Mais Brasil",
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin")

  // Enforce server-side: usuários que precisam trocar senha são bloqueados
  // antes de acessar qualquer área protegida.
  const rawSession = await auth()
  if (rawSession?.user?.mustChangePassword) {
    redirect("/alterar-senha-inicial")
  }

  return (
    <AdminLayoutShell
      role={session.role as "SUPER_ADMIN" | "PMB_SALES" | "PMB_RESELLER_MGR"}
      userName={session.name ?? "Admin"}
      userEmail={session.email ?? ""}
    >
      {children}
    </AdminLayoutShell>
  )
}
