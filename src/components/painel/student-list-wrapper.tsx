"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { StudentStatsBar, type StudentStats } from "./student-stats-bar"
import {
  StudentToolbar,
  type StudentFilter,
  type EnrollmentFilter,
} from "./student-toolbar"
import {
  StudentTable,
  type StudentListItem,
  type StudentStatus,
  type SortKey,
  type SortOrder,
} from "./student-table"
import { StudentDetailDrawer } from "./student-detail-drawer"

const emptyStats: StudentStats = {
  total: 0,
  ATIVO: 0,
  PENDENTE: 0,
  INATIVO: 0,
  BLOQUEADO: 0,
  DEVEDOR: 0,
  FORMADO: 0,
  INTERESSADO: 0,
}

// Ordem de exibicao dos status quando a coluna "Status" e usada para ordenar.
const statusOrder: Record<StudentStatus, number> = {
  ATIVO: 0,
  PENDENTE: 1,
  FORMADO: 2,
  INTERESSADO: 3,
  DEVEDOR: 4,
  INATIVO: 5,
  BLOQUEADO: 6,
}

export function StudentListWrapper() {
  const [students, setStudents] = useState<StudentListItem[]>([])
  const [stats, setStats] = useState<StudentStats>(emptyStats)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<StudentFilter>("TODOS")
  const [enrollmentFilter, setEnrollmentFilter] =
    useState<EnrollmentFilter>("TODOS")
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Alvo da confirmacao de bloqueio/desbloqueio (substitui o confirm() nativo).
  const [blockTarget, setBlockTarget] = useState<{
    id: string
    status: StudentStatus
    nome: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("q", search.trim())
      if (filter !== "TODOS") params.set("status", filter)
      if (enrollmentFilter !== "TODOS") params.set("enrollment", enrollmentFilter)
      const res = await fetch(`/api/painel/alunos?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar alunos")
        return
      }
      setStudents(body.data.students)
      setStats(body.data.stats)
    } catch {
      setError("Erro de rede ao carregar alunos")
    } finally {
      setLoading(false)
    }
  }, [search, filter, enrollmentFilter])

  useEffect(() => {
    const timeout = setTimeout(() => {
      load()
    }, 300)
    return () => clearTimeout(timeout)
  }, [load])

  // Ordenacao client-side da pagina carregada — instantanea, sem refetch.
  const sortedStudents = useMemo(() => {
    const dir = sortOrder === "asc" ? 1 : -1
    return [...students].sort((a, b) => {
      switch (sortKey) {
        case "nome":
          return a.nome.localeCompare(b.nome, "pt-BR") * dir
        case "email":
          return (a.email ?? "").localeCompare(b.email ?? "", "pt-BR") * dir
        case "coursesCount":
          return (a.coursesCount - b.coursesCount) * dir
        case "createdAt":
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
            dir
          )
        case "status":
          return (statusOrder[a.status] - statusOrder[b.status]) * dir
        default:
          return 0
      }
    })
  }, [students, sortKey, sortOrder])

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
        return prevKey
      }
      // Nova coluna: texto comeca asc; numero/data comeca desc (mais relevante).
      setSortOrder(key === "nome" || key === "email" ? "asc" : "desc")
      return key
    })
  }, [])

  // Executa o bloqueio/desbloqueio de fato. Mesma chamada de API e refetch de
  // antes — apenas o confirm()/alert() foram trocados por dialog + toast.
  const performToggleBlock = useCallback(
    async (student: { id: string; status: StudentStatus }) => {
      const isBlocked = student.status === "BLOQUEADO"
      const endpoint = isBlocked ? "desbloquear" : "bloquear"
      setPendingId(student.id)
      try {
        const res = await fetch(
          `/api/painel/alunos/${student.id}/${endpoint}`,
          { method: "POST" },
        )
        const body = await res.json()
        if (!res.ok) {
          toast.error(body.error ?? "Falha ao atualizar aluno")
          return
        }
        toast.success(
          isBlocked ? "Aluno desbloqueado." : "Aluno bloqueado.",
        )
        await load()
      } catch {
        toast.error("Erro de rede ao atualizar aluno")
      } finally {
        setPendingId(null)
      }
    },
    [load],
  )

  // Chamado pela tabela: abre o dialog de confirmacao (substitui o confirm()).
  const handleToggleBlock = useCallback((student: StudentListItem) => {
    setBlockTarget({ id: student.id, status: student.status, nome: student.nome })
  }, [])

  const blockTargetIsBlocked = blockTarget?.status === "BLOQUEADO"

  return (
    <div className="space-y-6">
      <StudentStatsBar stats={stats} />
      <StudentToolbar
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        enrollmentFilter={enrollmentFilter}
        onEnrollmentFilterChange={setEnrollmentFilter}
      />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div data-tour="alunos:lista">
        <StudentTable
          students={sortedStudents}
          loading={loading}
          pendingId={pendingId}
          sortKey={sortKey}
          sortOrder={sortOrder}
          onSort={handleSort}
          onViewDetails={(id) => setViewingId(id)}
          onToggleBlock={handleToggleBlock}
        />
      </div>
      <StudentDetailDrawer
        open={viewingId !== null}
        studentId={viewingId}
        onClose={() => setViewingId(null)}
        onToggleBlock={(id, status) => performToggleBlock({ id, status })}
      />

      <AlertDialog
        open={blockTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBlockTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blockTargetIsBlocked ? "Desbloquear aluno" : "Bloquear aluno"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blockTargetIsBlocked
                ? `Liberar o acesso de ${blockTarget?.nome} às aulas?`
                : `Bloquear o acesso de ${blockTarget?.nome} às aulas? O aluno deixará de conseguir assistir aos cursos.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId !== null}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (blockTarget) {
                  void performToggleBlock(blockTarget)
                  setBlockTarget(null)
                }
              }}
            >
              {blockTargetIsBlocked ? "Desbloquear" : "Bloquear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
