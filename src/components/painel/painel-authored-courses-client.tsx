"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MIN_SELLER_COMMISSION_PERCENT,
  minSalePrice,
  producerNetAt,
  type AuthoredPricingMode,
  type AuthorTerms,
} from "@/lib/course-authoring/split"

/**
 * Cursos PRODUZIDOS pela unidade.
 *
 * A tela existe porque não há aprovação da PMB: o produtor decide sozinho o
 * alcance, o preço e a comissão. O simulador de rateio é a contrapartida —
 * ele precisa ver quanto sobra para ele ANTES de publicar, não descobrir na
 * primeira venda.
 *
 * O cálculo vem de `@/lib/course-authoring/split`, o MESMO módulo que o
 * servidor usa para montar o split. Duplicar a conta aqui faria a tela
 * prometer um valor e o Asaas creditar outro.
 */

type AuthoredStatus = "DRAFT" | "PUBLISHED" | "PAUSED"
type Distribution = "OWN_ONLY" | "OWN_AND_PMB" | "NETWORK"

interface AuthoredCourse {
  id: string
  nome: string
  slug: string
  descricao: string | null
  cargaHoraria: string | null
  contentType: "COURSE" | "EBOOK"
  qtdAulas: number
  capaImageUrl: string | null
  authoredStatus: AuthoredStatus | null
  distribution: Distribution
  pricingMode: AuthoredPricingMode
  authorAmount: number | null
  sellerCommissionPercent: number | null
  platformFeePercent: number | null
  minSalePrice: number | null
  hasContent: boolean
}

interface Meta {
  canDistribute: boolean
  asaasConnected: boolean
  authoringEnabled: boolean
  minSellerCommissionPercent: number
  platformFeePercent: number
}

const PRICING_LABEL: Record<AuthoredPricingMode, string> = {
  FIXED: "Preço fixo",
  MIN_PRICE: "Preço mínimo",
  MIN_PRODUCER_NET: "Valor garantido para você",
}

const PRICING_HELP: Record<AuthoredPricingMode, string> = {
  FIXED: "O curso custa esse valor em todas as vitrines. Ninguém pode mudar.",
  MIN_PRICE:
    "Quem vender pode cobrar esse valor ou mais. Vendendo mais caro, você e a loja ganham juntos.",
  MIN_PRODUCER_NET:
    "Você recebe esse valor em toda venda, não importa por quanto a loja venda. A diferença fica com quem vendeu.",
}

const DISTRIBUTION_LABEL: Record<Distribution, string> = {
  OWN_ONLY: "Só na minha vitrine",
  OWN_AND_PMB: "Minha vitrine + Profissionaliza Mais Brasil",
  NETWORK: "Todas as vitrines da rede",
}

const STATUS_LABEL: Record<AuthoredStatus, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  PAUSED: "Pausado pela PMB",
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

interface FormState {
  nome: string
  descricao: string
  cargaHoraria: string
  pricingMode: AuthoredPricingMode
  authorAmount: string
  sellerCommissionPercent: string
}

const EMPTY_FORM: FormState = {
  nome: "",
  descricao: "",
  cargaHoraria: "",
  pricingMode: "FIXED",
  authorAmount: "",
  sellerCommissionPercent: String(MIN_SELLER_COMMISSION_PERCENT),
}

export function PainelAuthoredCoursesClient({ canManage }: { canManage: boolean }) {
  const [courses, setCourses] = useState<AuthoredCourse[] | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // "new" e "new-ebook" são estados de CRIAÇÃO distintos, não um booleano +
  // parâmetro: o tipo é escolhido no botão e o formulário abre já sabendo o que
  // está sendo criado.
  const [editing, setEditing] = useState<AuthoredCourse | "new" | "new-ebook" | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch("/api/painel/cursos-autorais")
      if (!res.ok) throw new Error("falha ao carregar")
      const json = await res.json()
      setCourses(json.data.courses)
      setMeta({
        canDistribute: json.data.canDistribute,
        asaasConnected: json.data.asaasConnected,
        authoringEnabled: json.data.authoringEnabled,
        minSellerCommissionPercent: json.data.minSellerCommissionPercent,
        platformFeePercent: json.data.platformFeePercent,
      })
    } catch {
      setLoadError("Não foi possível carregar seus cursos. Recarregue a página.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(course: AuthoredCourse, body: Record<string, unknown>) {
    setBusyId(course.id)
    try {
      const res = await fetch(`/api/painel/cursos-autorais/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível salvar.")
        return false
      }
      await load()
      return true
    } finally {
      setBusyId(null)
    }
  }

  async function remove(course: AuthoredCourse) {
    setBusyId(course.id)
    try {
      const res = await fetch(`/api/painel/cursos-autorais/${course.id}`, {
        method: "DELETE",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível excluir.")
        return
      }
      toast.success("Curso excluído.")
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function openContent(course: AuthoredCourse) {
    setBusyId(course.id)
    try {
      const res = await fetch(`/api/painel/cursos-autorais/${course.id}/conteudo`, {
        method: "POST",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível abrir a plataforma de aulas.")
        return
      }
      window.open(json.data.url, "_blank", "noopener,noreferrer")
    } finally {
      setBusyId(null)
    }
  }

  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>
  }

  if (!courses || !meta) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-lg font-semibold">Conteúdos que você produz</h2>
          <p className="text-sm text-muted-foreground">
            Cursos e e-books de autoria própria. Você define onde eles são
            vendidos e quanto paga de comissão a quem vender — o mínimo é{" "}
            {meta.minSellerCommissionPercent}%. A Profissionaliza Mais Brasil fica
            com {meta.platformFeePercent}% quando a venda acontece em outra
            vitrine; na sua, o valor é todo seu.
          </p>
        </div>
        {canManage && (
          /* Dois botões, e não um menu: o tipo é decidido na criação e não muda
             depois. Escolher antes é o que torna a decisão consciente. */
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Novo curso
            </Button>
            <Button variant="outline" onClick={() => setEditing("new-ebook")}>
              <BookOpen className="size-4" /> Novo e-book
            </Button>
          </div>
        )}
      </div>

      {!meta.canDistribute && (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              Conecte a conta Asaas para vender fora da sua vitrine
            </p>
            <p className="mt-1">
              É para ela que o repasse das vendas é enviado. Sem a conta
              conectada, seus cursos só podem ser vendidos na sua própria loja.{" "}
              <a className="underline" href="/painel/configuracoes">
                Conectar agora
              </a>
            </p>
          </div>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Você ainda não produziu nenhum conteúdo.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {courses.map((course) => (
            <li key={course.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{course.nome}</span>
                    {course.contentType === "EBOOK" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        <BookOpen className="size-3" /> E-book
                      </span>
                    )}
                    <StatusBadge status={course.authoredStatus} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {DISTRIBUTION_LABEL[course.distribution]} ·{" "}
                    {PRICING_LABEL[course.pricingMode]}{" "}
                    {course.authorAmount !== null && formatBRL(course.authorAmount)}
                    {course.sellerCommissionPercent !== null &&
                      ` · comissão ${course.sellerCommissionPercent}%`}
                  </p>
                  {!course.hasContent && (
                    <p className="text-sm text-amber-700">
                      {course.contentType === "EBOOK"
                        ? "Sem arquivo enviado — o e-book não pode ser publicado."
                        : "Sem conteúdo cadastrado — o curso não pode ser publicado."}
                    </p>
                  )}
                </div>

                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {meta.authoringEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === course.id}
                        onClick={() => void openContent(course)}
                      >
                        {/* No e-book o que se edita lá é o ARQUIVO. "Conteúdo"
                            faria o autor procurar módulos e aulas que não existem. */}
                        <ExternalLink className="size-4" />{" "}
                        {course.contentType === "EBOOK" ? "Arquivo" : "Conteúdo"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === course.id}
                      onClick={() => setEditing(course)}
                    >
                      <Pencil className="size-4" /> Editar
                    </Button>
                    {course.authoredStatus === "PAUSED" ? (
                      // Pausa é da PMB e só ela desfaz (o PATCH responde 409).
                      // Sem este ramo o botão "Publicar" aparecia — o status
                      // não é PUBLISHED — e prometia o que a rota recusa.
                      <span className="text-[11px] font-medium text-amber-700">
                        Pausado pela PMB — fale com o suporte.
                      </span>
                    ) : course.authoredStatus === "PUBLISHED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === course.id}
                        onClick={() =>
                          void patch(course, { authoredStatus: "DRAFT" })
                        }
                      >
                        Despublicar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busyId === course.id || !course.hasContent}
                        onClick={async () => {
                          const ok = await patch(course, {
                            authoredStatus: "PUBLISHED",
                          })
                          if (ok) toast.success("Curso publicado.")
                        }}
                      >
                        Publicar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === course.id}
                      onClick={() => void remove(course)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CourseDialog
          course={editing === "new" || editing === "new-ebook" ? null : editing}
          contentType={editing === "new-ebook" ? "EBOOK" : editing === "new" ? "COURSE" : editing.contentType}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: AuthoredStatus | null }) {
  const value = status ?? "DRAFT"
  const tone =
    value === "PUBLISHED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value === "PAUSED"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-slate-100 text-slate-700 border-slate-200"
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>
      {STATUS_LABEL[value]}
    </span>
  )
}

function CourseDialog({
  course,
  contentType,
  meta,
  onClose,
  onSaved,
}: {
  course: AuthoredCourse | null
  /** Tipo do conteúdo sendo criado/editado — vem do botão, não de um seletor. */
  contentType: "COURSE" | "EBOOK"
  meta: Meta
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const ebook = contentType === "EBOOK"
  const [form, setForm] = useState<FormState>(
    course
      ? {
          nome: course.nome,
          descricao: course.descricao ?? "",
          cargaHoraria: course.cargaHoraria ?? "",
          pricingMode: course.pricingMode,
          authorAmount: course.authorAmount?.toString() ?? "",
          sellerCommissionPercent:
            course.sellerCommissionPercent?.toString() ??
            String(MIN_SELLER_COMMISSION_PERCENT),
        }
      : EMPTY_FORM,
  )
  const [distribution, setDistribution] = useState<Distribution>(
    course?.distribution ?? "OWN_ONLY",
  )
  const [saving, setSaving] = useState(false)

  const amount = Number(form.authorAmount.replace(",", "."))
  const commission = Number(form.sellerCommissionPercent.replace(",", "."))
  const terms: AuthorTerms | null =
    Number.isFinite(amount) && amount > 0 && Number.isFinite(commission)
      ? {
          pricingMode: form.pricingMode,
          authorAmount: amount,
          sellerCommissionPercent: commission,
          platformFeePercent:
            course?.platformFeePercent ?? meta.platformFeePercent,
        }
      : null

  async function submit() {
    setSaving(true)
    try {
      const body = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        cargaHoraria: form.cargaHoraria.trim() || null,
        pricingMode: form.pricingMode,
        authorAmount: amount,
        sellerCommissionPercent: commission,
        // Só na CRIAÇÃO: o PATCH não aceita o campo, de propósito — trocar o
        // tipo de um conteúdo já publicado reescreveria o que o comprador viu.
        ...(course ? { distribution } : { contentType }),
      }
      const res = await fetch(
        course ? `/api/painel/cursos-autorais/${course.id}` : "/api/painel/cursos-autorais",
        {
          method: course ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível salvar.")
        return
      }
      toast.success(
        course
          ? ebook ? "E-book atualizado." : "Curso atualizado."
          : ebook ? "E-book criado." : "Curso criado.",
      )
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {course
              ? ebook ? "Editar e-book" : "Editar curso"
              : ebook ? "Novo e-book próprio" : "Novo curso próprio"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome">{ebook ? "Nome do e-book" : "Nome do curso"}</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="carga">
              {ebook ? "Tempo estimado de leitura" : "Carga horária"}
            </Label>
            <Input
              id="carga"
              placeholder={ebook ? "ex.: 2 horas" : "ex.: 40 horas"}
              value={form.cargaHoraria}
              onChange={(e) => setForm({ ...form, cargaHoraria: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Como o preço funciona</Label>
            <Select
              value={form.pricingMode}
              onValueChange={(v) =>
                typeof v === "string" &&
                setForm({ ...form, pricingMode: v as AuthoredPricingMode })
              }
              items={(Object.keys(PRICING_LABEL) as AuthoredPricingMode[]).map((k) => ({
                value: k,
                label: PRICING_LABEL[k],
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRICING_LABEL) as AuthoredPricingMode[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PRICING_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {PRICING_HELP[form.pricingMode]}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="valor">
                {form.pricingMode === "MIN_PRODUCER_NET"
                  ? "Quanto você recebe (R$)"
                  : "Valor (R$)"}
              </Label>
              <Input
                id="valor"
                inputMode="decimal"
                value={form.authorAmount}
                onChange={(e) => setForm({ ...form, authorAmount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comissao">Comissão de quem vender (%)</Label>
              <Input
                id="comissao"
                inputMode="decimal"
                value={form.sellerCommissionPercent}
                onChange={(e) =>
                  setForm({ ...form, sellerCommissionPercent: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Mínimo {meta.minSellerCommissionPercent}%.
              </p>
            </div>
          </div>

          {course && (
            <div className="space-y-1.5">
              <Label>Onde este curso é vendido</Label>
              <Select
                value={distribution}
                onValueChange={(v) =>
                  typeof v === "string" && setDistribution(v as Distribution)
                }
                items={(Object.keys(DISTRIBUTION_LABEL) as Distribution[]).map((k) => ({
                  value: k,
                  label: DISTRIBUTION_LABEL[k],
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DISTRIBUTION_LABEL) as Distribution[]).map((k) => (
                    <SelectItem key={k} value={k} disabled={k !== "OWN_ONLY" && !meta.canDistribute}>
                      {DISTRIBUTION_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!meta.canDistribute && (
                <p className="text-xs text-amber-700">
                  Conecte a conta Asaas da unidade para vender fora da sua vitrine.
                </p>
              )}
            </div>
          )}

          {terms && <SplitSimulator terms={terms} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Mostra a divisão do dinheiro ANTES de publicar.
 *
 * Sem aprovação da PMB no caminho, esta é a única chance de o produtor entender
 * o que está aceitando. Os números saem do mesmo módulo puro que o servidor usa
 * para montar o split — nunca de uma conta reimplementada aqui.
 */
function SplitSimulator({ terms }: { terms: AuthorTerms }) {
  const floor = minSalePrice(terms)
  const exemplo = Number.isFinite(floor) ? floor : terms.authorAmount
  const produtor = producerNetAt(terms, exemplo)
  const plataforma = Math.round(exemplo * terms.platformFeePercent) / 100
  const vendedor = Math.round((exemplo - produtor - plataforma) * 100) / 100

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
      <p className="font-medium">Vendido em outra vitrine por {formatBRL(exemplo)}</p>
      <dl className="space-y-1">
        <div className="flex justify-between">
          <dt>Você (produtor)</dt>
          <dd className="font-medium">{formatBRL(produtor)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Quem vendeu</dt>
          <dd>{formatBRL(vendedor)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Profissionaliza Mais Brasil ({terms.platformFeePercent}%)</dt>
          <dd>{formatBRL(plataforma)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Na sua própria vitrine você recebe o valor cheio, descontadas apenas as
        taxas do meio de pagamento. Os percentuais são aplicados sobre o valor
        líquido da cobrança, então a taxa do Asaas é dividida proporcionalmente.
      </p>
    </div>
  )
}
