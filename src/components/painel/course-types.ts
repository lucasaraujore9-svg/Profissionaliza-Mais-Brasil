/**
 * Tipo compartilhado dos itens do catálogo de cursos no painel (revendedor).
 * Extraído de course-list-table.tsx (UI morta, removida) para que o drawer de
 * edição e o wrapper da lista compartilhem a mesma forma sem depender de um
 * componente não utilizado.
 */
export interface CourseListItem {
  id: string
  courseId: string
  title: string
  description: string | null
  capaImageUrl: string | null
  qtdAulas: number
  cargaHoraria: string | null
  price: number
  parcelas: number | null
  paymentType: "ONE_TIME" | "MONTHLY"
  isVisible: boolean
  isFeatured: boolean
  customOrder: number
  hasCustomCapa?: boolean
  hasCustomDescription?: boolean
  hasCustomParcelas?: boolean
  enrollmentsCount: number
  createdAt?: string
  updatedAt?: string
}
