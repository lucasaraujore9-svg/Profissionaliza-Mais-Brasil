"use client"

import { CourseBulkEdit as SharedCourseBulkEdit } from "@/components/shared/course-bulk-edit"

interface CourseBulkEditProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Edição em massa dos cursos da vitrine do revendedor.
 * Casca fina sobre o componente compartilhado — fixa o endpoint do painel
 * e os textos específicos da vitrine do revendedor.
 */
export function CourseBulkEdit(props: CourseBulkEditProps) {
  return (
    <SharedCourseBulkEdit
      {...props}
      endpoint="/api/painel/cursos/bulk"
      subtitle="Edite preço, parcelas e descrição de vários cursos de uma vez. Alterações afetam apenas a sua vitrine."
      scopeNote={
        <>
          <strong className="font-semibold text-[var(--color-pmb-green-900)]">
            Parcelas sem juros
          </strong>{" "}
          é apenas informativo — controla o texto exibido na vitrine. O
          parcelamento sem juros de fato precisa ser configurado por você na sua
          conta do <strong>Mercado Pago</strong>. Deixe vazio para usar o padrão
          do catálogo.
        </>
      }
    />
  )
}
