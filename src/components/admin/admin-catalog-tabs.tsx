"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AdminCatalogClient } from "@/components/admin/admin-catalog-client"
import { AdminPackagesClient } from "@/components/admin/admin-packages-client"
import { AdminPlansClient } from "@/components/admin/admin-plans-client"

interface Option {
  id: string
  name: string
}

export function AdminCatalogTabs({
  canEdit,
  canViewPlans,
  canManagePlans,
  categories,
  packages,
}: {
  canEdit: boolean
  /** Sem `assinaturas.view` a aba nem aparece — nao e so o botao que some. */
  canViewPlans: boolean
  canManagePlans: boolean
  categories: Option[]
  packages: Option[]
}) {
  return (
    <Tabs defaultValue="cursos">
      <TabsList>
        <TabsTrigger value="cursos">Cursos</TabsTrigger>
        <TabsTrigger value="pacotes">Pacotes</TabsTrigger>
        {canViewPlans && (
          <TabsTrigger value="assinaturas">Assinaturas</TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="cursos" className="mt-4">
        <AdminCatalogClient canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="pacotes" className="mt-4">
        <AdminPackagesClient />
      </TabsContent>
      {canViewPlans && (
        <TabsContent value="assinaturas" className="mt-4">
          <AdminPlansClient
            canEdit={canManagePlans}
            categories={categories}
            packages={packages}
          />
        </TabsContent>
      )}
    </Tabs>
  )
}
