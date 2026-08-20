"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CourseListWrapper } from "./course-list-wrapper"
import { PainelPackagesClient } from "./painel-packages-client"
import { PainelPlansClient } from "./painel-plans-client"

type TabId = "cursos" | "pacotes" | "assinaturas"

export function PainelCatalogTabs({
  canManageCourses,
  canManagePackages,
  canViewPlans,
  canManagePlans,
  categories,
  packages,
}: {
  canManageCourses: boolean
  canManagePackages: boolean
  /** Sem `assinaturas.view` a aba nem aparece — nao e so o botao que some. */
  canViewPlans: boolean
  canManagePlans: boolean
  categories: { id: string; name: string }[]
  packages: { id: string; name: string }[]
}) {
  const [active, setActive] = useState<TabId>("cursos")

  return (
    <div>
      <Tabs value={active} onValueChange={(v) => typeof v === "string" && setActive(v as TabId)}>
        <TabsList
          data-tour="cursos:tabs"
          className="flex w-full flex-wrap justify-start gap-1 bg-[var(--color-pmb-mist,#f7faf7)] p-1"
        >
          <TabsTrigger
            value="cursos"
            className="data-active:bg-white data-active:text-[var(--color-pmb-green,#025918)] data-active:shadow-sm"
          >
            Cursos
          </TabsTrigger>
          <TabsTrigger
            value="pacotes"
            className="data-active:bg-white data-active:text-[var(--color-pmb-green,#025918)] data-active:shadow-sm"
          >
            Pacotes
          </TabsTrigger>
          {canViewPlans && (
            <TabsTrigger
              value="assinaturas"
              className="data-active:bg-white data-active:text-[var(--color-pmb-green,#025918)] data-active:shadow-sm"
            >
              Assinaturas
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <div className="mt-6">
        {active === "cursos" && <CourseListWrapper canManage={canManageCourses} />}
        {active === "pacotes" && (
          <PainelPackagesClient canManage={canManagePackages} />
        )}
        {active === "assinaturas" && canViewPlans && (
          <PainelPlansClient
            canManage={canManagePlans}
            categories={categories}
            packages={packages}
          />
        )}
      </div>
    </div>
  )
}
