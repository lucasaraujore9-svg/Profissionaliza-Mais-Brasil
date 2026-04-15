import { ProfileTabs } from "@/components/admin/profile-tabs"

export const metadata = {
  title: "Meu Perfil | Admin PMB",
  description: "Gerencie seus dados de acesso ao painel administrativo.",
}

export default function AdminMeuPerfilPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)]">
          Meu perfil
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Gerencie seus dados pessoais, senha e encerre sua sessão.
        </p>
      </div>
      <ProfileTabs />
    </div>
  )
}
