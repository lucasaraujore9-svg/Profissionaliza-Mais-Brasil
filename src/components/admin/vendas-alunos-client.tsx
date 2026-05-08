"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface StudentItem {
  id: string
  nome: string
  email: string | null
  fone: string | null
  cpf: string | null
  status: string
  eaAlunoId: string | null
  createdAt: string
}

export function VendasAlunosClient() {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<StudentItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/admin/alunos?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const body = await res.json()
        setItems(body.data)
      }
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
          Alunos da vitrine PMB
        </h1>
        <p className="text-sm text-muted-foreground">
          Cadastrados por você ou pela equipe PMB
        </p>
      </div>

      <Input
        placeholder="Buscar por email, nome ou CPF"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-pmb-mist)] text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">CPF</th>
              <th className="px-4 py-3 font-semibold">ID plataforma</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Cadastro</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/admin/vendas/alunos/${s.id}`} className="hover:underline text-[var(--color-pmb-green-900)]">
                    {s.nome}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.cpf ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.eaAlunoId ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={s.status === "ATIVO" ? "default" : "outline"}>
                    {s.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum aluno encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
