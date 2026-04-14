"use client"

import { useCallback, useEffect, useState } from "react"
import { StudentStatsBar, type StudentStats } from "./student-stats-bar"
import { StudentToolbar, type StudentFilter } from "./student-toolbar"
import {
  StudentTable,
  type StudentListItem,
  type StudentStatus,
} from "./student-table"
import { StudentDetailDrawer } from "./student-detail-drawer"

const emptyStats: StudentStats = {
  total: 0,
  ATIVO: 0,
  INATIVO: 0,
  BLOQUEADO: 0,
  DEVEDOR: 0,
  FORMADO: 0,
  INTERESSADO: 0,
}

export function StudentListWrapper() {
  const [students, setStudents] = useState<StudentListItem[]>([])
  const [stats, setStats] = useState<StudentStats>(emptyStats)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<StudentFilter>("TODOS")
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("q", search.trim())
      if (filter !== "TODOS") params.set("status", filter)
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
  }, [search, filter])

  useEffect(() => {
    const timeout = setTimeout(() => {
      load()
    }, 300)
    return () => clearTimeout(timeout)
  }, [load])

  const handleToggleBlock = useCallback(
    async (student: StudentListItem | { id: string; status: StudentStatus }) => {
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
          alert(body.error ?? "Falha ao atualizar aluno")
          return
        }
        await load()
      } catch {
        alert("Erro de rede ao atualizar aluno")
      } finally {
        setPendingId(null)
      }
    },
    [load],
  )

  return (
    <div className="space-y-6">
      <StudentStatsBar stats={stats} />
      <StudentToolbar
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
      />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <StudentTable
        students={students}
        loading={loading}
        pendingId={pendingId}
        onViewDetails={(id) => setViewingId(id)}
        onToggleBlock={handleToggleBlock}
      />
      <StudentDetailDrawer
        open={viewingId !== null}
        studentId={viewingId}
        onClose={() => setViewingId(null)}
        onToggleBlock={(id, status) => handleToggleBlock({ id, status })}
      />
    </div>
  )
}
