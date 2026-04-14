import { PageHeader } from "@/components/painel/page-header"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ResellerStatsBar } from "@/components/admin/reseller-stats-bar"
import { ResellerListToolbar } from "@/components/admin/reseller-list-toolbar"
import { ResellerTable } from "@/components/admin/reseller-table"

export default function AdminResellersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Revendedores"
        description="Gerencie os revendedores do ecossistema Profissionaliza Mais Brasil."
        actions={
          <Button className="bg-blue-600 text-white hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Novo revendedor
          </Button>
        }
      />
      <ResellerStatsBar />
      <ResellerListToolbar />
      <ResellerTable />
    </div>
  )
}
