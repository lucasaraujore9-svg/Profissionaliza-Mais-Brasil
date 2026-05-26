import { PageHeader } from "@/components/painel/page-header"
import { BannerSlidesManager } from "@/components/shared/banner-slides-manager"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { redirect } from "next/navigation"

export default async function AdminBannerPage() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) {
    redirect("/admin")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banner do site PMB"
        description="Banner principal exibido na home do site profissionalizamaisbrasil.com.br."
      />

      <BannerSlidesManager
        apiBase="/api/admin/banner"
        title="Slides do banner principal"
        description="Adicione uma imagem única ou múltiplos slides (carrossel). Cada slide precisa de desktop (1920×600px) e mobile (1080×1080px). Enquanto houver pelo menos 1 slide ativo, a hero exibe só a imagem (sem headline ou busca por cima)."
      />
    </div>
  )
}
