"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AdminCatalogClient } from "@/components/admin/admin-catalog-client"
import { AdminPackagesClient } from "@/components/admin/admin-packages-client"
import { AdminPlansClient } from "@/components/admin/admin-plans-client"
import { AdminAuthoredCoursesClient } from "@/components/admin/admin-authored-courses-client"

interface Option {
  id: string
  name: string
}

export function AdminCatalogTabs({
  canEdit,
  canViewPlans,
  canManagePlans,
  canViewAuthored,
  canManageAuthored,
  categories,
  packages,
}: {
  canEdit: boolean
  /** Sem `cursosAutorais.view` a aba nem aparece. */
  canViewAuthored: boolean
  canManageAuthored: boolean
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
        {canViewAuthored && (
          <TabsTrigger value="autorais">Cursos das unidades</TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="cursos" className="mt-4">
        <AdminCatalogClient canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="pacotes" className="mt-4">
        <AdminPackagesClient />
      </TabsContent>
      {canViewAuthored && (
        <TabsContent value="autorais" className="mt-4">
          <AdminAuthoredCoursesClient canManage={canManageAuthored} />
        </TabsContent>
      )}
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
