"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CourseOption {
  id: string
  nome: string
  preco: number
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function NovaVendaClient({
  role,
  courses,
}: {
  role: string
  courses: CourseOption[]
}) {
  const [pending, startTransition] = useTransition()
  const [student, setStudent] = useState({
    nome: "",
    email: "",
    cpf: "",
    fone: "",
  })
  const [studentId, setStudentId] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<string>("")
  const [couponCode, setCouponCode] = useState("")
  const [result, setResult] = useState<{
    initPoint: string
    finalAmount: number
    discountAmount: number
    gateway?: "MP" | "ASAAS"
  } | null>(null)

  const cap = role === "PMB_SALES" ? 50 : 100
  const selectedCourse = courses.find((c) => c.id === courseId) ?? null

  function createStudent() {
    if (!student.nome || !student.email || !student.cpf) {
      toast.error("Preencha nome, email e CPF")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/alunos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(student),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao cadastrar aluno")
        return
      }
      setStudentId(body.data.id)
      toast.success(body.data.existed ? "Aluno já existente reutilizado" : "Aluno cadastrado")
    })
  }

  function generateLink() {
    if (!studentId || !courseId) {
      toast.error("Selecione aluno e curso")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/vendas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId,
          courseId,
          couponCode: couponCode.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao gerar link")
        return
      }
      setResult(body.data)
      toast.success("Link de pagamento gerado")
    })
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
          Nova venda direta
        </h1>
        <p className="text-sm text-muted-foreground">
          Cap de desconto para seu papel: <strong>{cap}%</strong>
        </p>
      </div>

      <Section title="1. Aluno">
        {studentId ? (
          <div className="flex items-center justify-between rounded-lg border bg-emerald-50 p-3">
            <div>
              <div className="font-medium">{student.nome || "Aluno selecionado"}</div>
              <div className="text-xs text-muted-foreground">{student.email}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStudentId(null)
                setResult(null)
              }}
            >
              Trocar
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome</Label>
              <Input
                value={student.nome}
                onChange={(e) => setStudent({ ...student, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={student.email}
                onChange={(e) => setStudent({ ...student, email: e.target.value })}
              />
            </div>
            <div>
              <Label>CPF</Label>
              <Input
                value={student.cpf}
                onChange={(e) => setStudent({ ...student, cpf: e.target.value })}
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={student.fone}
                onChange={(e) => setStudent({ ...student, fone: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Button
                onClick={createStudent}
                disabled={pending}
                className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
              >
                {pending ? "Salvando…" : "Usar este aluno"}
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="2. Curso">
        <Select value={courseId} onValueChange={(v) => setCourseId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um curso" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome} — {formatBRL(c.preco)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedCourse && (
          <p className="mt-2 text-sm text-muted-foreground">
            Preço da vitrine PMB: <strong>{formatBRL(selectedCourse.preco)}</strong>
          </p>
        )}
      </Section>

      <Section title="3. Cupom (opcional)">
        <Input
          placeholder="CODIGO"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          O servidor valida se o desconto respeita seu cap ({cap}%).
        </p>
      </Section>

      <Section title="4. Gerar link">
        <Button
          onClick={generateLink}
          disabled={pending || !studentId || !courseId}
          className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
        >
          {pending ? "Gerando…" : "Gerar link de pagamento"}
        </Button>
      </Section>

      {result && (
        <div className="rounded-xl border bg-emerald-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-display text-[var(--color-pmb-green-900)]">
              Link gerado
            </div>
            {result.gateway && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                {result.gateway === "ASAAS" ? "Asaas" : "Mercado Pago"}
              </span>
            )}
          </div>
          <div className="text-sm">
            Valor final: <strong>{formatBRL(result.finalAmount)}</strong>
            {result.discountAmount > 0 && (
              <span className="text-muted-foreground ml-2">
                (desconto {formatBRL(result.discountAmount)})
              </span>
            )}
          </div>
          <a
            href={result.initPoint}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-[var(--color-pmb-green)] underline break-all"
          >
            {result.initPoint}
          </a>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(result.initPoint)
                toast.success("Link copiado")
              }}
            >
              Copiar link
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <h2 className="mb-3 font-display text-[var(--color-pmb-green-900)]">{title}</h2>
      {children}
    </div>
  )
}
