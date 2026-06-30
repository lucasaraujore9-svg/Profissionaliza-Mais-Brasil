"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search, ShoppingBag, CheckCircle2 } from "lucide-react"

interface CatalogCourse {
  id: string
  nome: string
  slug: string
  descricao: string | null
  capa: string | null
  categoria: string | null
  price: number
  installments: number | null
  paymentType: "ONE_TIME" | "MONTHLY"
  monthlyMonths: number | null
  ownedStatus: "PENDING" | "ACTIVE" | "COMPLETED" | null
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function StudentBuyClient() {
  const router = useRouter()
  const [courses, setCourses] = useState<CatalogCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("all")
  const [buying, setBuying] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/aluno/catalogo")
        const body = await res.json()
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar catálogo")
          return
        }
        setCourses(body.data.courses ?? [])
      } catch {
        setError("Erro de rede ao carregar catálogo")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const c of courses) {
      if (c.categoria) set.add(c.categoria)
    }
    return ["all", ...[...set].sort()]
  }, [courses])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses.filter((c) => {
      if (category !== "all" && c.categoria !== category) return false
      if (!q) return true
      return (
        c.nome.toLowerCase().includes(q) ||
        (c.categoria?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [courses, query, category])

  async function buy(courseId: string) {
    setBuying(courseId)
    setFeedback(null)
    try {
      const res = await fetch("/api/aluno/comprar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFeedback(body.error ?? "Falha ao iniciar compra")
        return
      }
      // PMB (venda direta): a resposta traz initPoint → redirect ao gateway.
      // Checar PRIMEIRO porque a resposta PMB também inclui enrollmentId.
      const initPoint = body.data?.initPoint
      if (initPoint) {
        window.location.href = initPoint
        return
      }
      // Revenda: matrícula PENDING criada (sem initPoint) → paga no próprio
      // site via Payment Brick.
      const enrollmentId = body.data?.enrollmentId
      if (enrollmentId) {
        router.push(`/aluno/comprar/pagar/${enrollmentId}`)
        return
      }
      setFeedback("Cobrança gerada, mas o link de pagamento não veio.")
    } catch {
      setFeedback("Erro de rede ao iniciar compra")
    } finally {
      setBuying(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando catálogo...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1" data-tour="aluno-comprar:busca">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou categoria"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          />
        </div>
        {categories.length > 1 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Todas as categorias" : c}
              </option>
            ))}
          </select>
        )}
      </div>

      {feedback && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {feedback}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nenhum curso encontrado.
        </p>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-tour="aluno-comprar:catalogo"
        >
          {filtered.map((c) => {
            const owned = c.ownedStatus !== null
            const isMonthly = c.paymentType === "MONTHLY"
            const installmentValue =
              !isMonthly && c.installments && c.installments > 1
                ? c.price / c.installments
                : null
            return (
              <article
                key={c.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                {c.capa ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.capa}
                    alt={c.nome}
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                    <ShoppingBag className="h-8 w-8" />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  {c.categoria && (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {c.categoria}
                    </p>
                  )}
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {c.nome}
                  </h3>
                  {c.descricao && (
                    <p className="mt-2 line-clamp-3 text-xs text-gray-600">
                      {c.descricao}
                    </p>
                  )}

                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-mono text-lg font-bold text-[var(--color-pmb-green)]">
                      {brl(c.price)}
                    </span>
                    {isMonthly && (
                      <span className="text-xs font-semibold text-gray-500">
                        /mês
                      </span>
                    )}
                  </div>
                  {isMonthly && c.monthlyMonths ? (
                    <p className="text-[11px] text-gray-500">
                      {c.monthlyMonths}{" "}
                      {c.monthlyMonths === 1 ? "mensalidade" : "mensalidades"} ·
                      total {brl(c.price * c.monthlyMonths)}
                    </p>
                  ) : null}
                  {installmentValue !== null && (
                    <p className="text-[11px] text-gray-500">
                      ou {c.installments}x de {brl(installmentValue)}
                    </p>
                  )}

                  <div className="mt-auto pt-4">
                    {owned ? (
                      <span className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        {c.ownedStatus === "PENDING"
                          ? "Cobrança pendente"
                          : "Você já tem este curso"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => buy(c.id)}
                        disabled={buying === c.id}
                        data-tour="aluno-comprar:comprar"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
                      >
                        {buying === c.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShoppingBag className="h-4 w-4" />
                        )}
                        Comprar agora
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
