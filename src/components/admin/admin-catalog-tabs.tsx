"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AdminCatalogClient } from "@/components/admin/admin-catalog-client"
import { AdminPackagesClient } from "@/components/admin/admin-packages-client"

export function AdminCatalogTabs({ canEdit }: { canEdit: boolean }) {
  return (
    <Tabs defaultValue="cursos">
      <TabsList>
        <TabsTrigger value="cursos">Cursos</TabsTrigger>
        <TabsTrigger value="pacotes">Pacotes</TabsTrigger>
      </TabsList>
      <TabsContent value="cursos" className="mt-4">
        <AdminCatalogClient canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="pacotes" className="mt-4">
        <AdminPackagesClient />
      </TabsContent>
    </Tabs>
  )
}
