import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
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

  // NOTA: o enforcement server-side de mustChangePassword foi REVERTIDO aqui —
  // estava bloqueando contas existentes (super admin com flag legada) em
  // produção. Re-introduzir só após garantir que (a) contas ativas não tenham
  // a flag legada e (b) o JWT seja revalidado pós-troca (evita loop). Ver R22.

  return (
    <AdminLayoutShell
      role={session.role as "SUPER_ADMIN" | "PMB_SALES" | "PMB_SALES_MGR" | "PMB_REVENDA_SALES" | "PMB_RESELLER_MGR"}
      userName={session.name ?? "Admin"}
      userEmail={session.email ?? ""}
    >
      {children}
    </AdminLayoutShell>
  )
}
