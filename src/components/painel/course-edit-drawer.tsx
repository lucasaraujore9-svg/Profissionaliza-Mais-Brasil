"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, X, Upload, RotateCcw, Info } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  APRENDIZADO_DEFAULT,
  APRENDIZADO_MAX_ITEMS,
  aprendizadoToText,
  parseAprendizado,
  resolveAprendizado,
} from "@/lib/courses/aprendizado"
import type { CourseListItem } from "./course-types"

interface CourseEditDrawerProps {
  course: CourseListItem | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

interface CourseDetail {
  id: string
  title: string
  description: string | null
  capaImageUrl: string | null
  price: number
  precoDe: number | null
  parcelas: number | null
  paymentType: "ONE_TIME" | "MONTHLY"
  monthlyAvailable: boolean
  isVisible: boolean
  isFeatured: boolean
  customDescription: string | null
  customCapaUrl: string | null
  customParcelas: number | null
  customAprendizado: string[]
  defaultCapaUrl: string | null
  defaultParcelas: number | null
  defaultDescription: string | null
  defaultAprendizado: string[]
}

export function CourseEditDrawer({
  course,
  open,
  onClose,
  onSaved,
}: CourseEditDrawerProps) {
  const [detail, setDetail] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [price, setPrice] = useState("")
  // Preço de tabela ("De R$ X" riscado). Vazio = a vitrine não exibe "De".
  const [precoDe, setPrecoDe] = useState("")
  const [paymentType, setPaymentType] = useState<"ONE_TIME" | "MONTHLY">("ONE_TIME")
  const [description, setDescription] = useState("")
  // Texto cru de "O que vai aprender" (1 item por linha). Vazio = herda o
  // padrão da PMB — por isso o placeholder mostra o que está herdado hoje.
  const [aprendizado, setAprendizado] = useState("")
  const [parcelas, setParcelas] = useState("")
  const [isVisible, setIsVisible] = useState(true)
  const [isFeatured, setIsFeatured] = useState(false)
  const [capaUrl, setCapaUrl] = useState<string | null>(null)
  const [hasCustomCapa, setHasCustomCapa] = useState(false)
  const [uploadingCapa, setUploadingCapa] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!course || !open) {
      setDetail(null)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    fetch(`/api/painel/cursos/${course.id}`)
      .then(async (res) => {
        if (!active) return
        const body = await res.json()
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar curso")
          return
        }
        const data = body.data as CourseDetail
        setDetail(data)
        setPrice(
          data.price.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        )
        setPrecoDe(
          data.precoDe != null
            ? data.precoDe.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : "",
        )
        setPaymentType(data.paymentType)
        setDescription(data.customDescription ?? "")
        setAprendizado(aprendizadoToText(data.customAprendizado))
        setParcelas(
          data.customParcelas != null ? String(data.customParcelas) : "",
        )
        setIsVisible(data.isVisible)
        setIsFeatured(data.isFeatured)
        setCapaUrl(data.customCapaUrl ?? data.defaultCapaUrl ?? null)
        setHasCustomCapa(data.customCapaUrl != null)
      })
      .catch(() => {
        if (active) setError("Erro de rede ao carregar curso")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [course, open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (!open || !course) return null

  const handleUploadCapa = async (file: File) => {
    setUploadingCapa(true)
    setError(null)
    try {
      const form = new FormData()
      form.set("file", file)
      const res = await fetch(`/api/painel/cursos/${course.id}/capa`, {
        method: "POST",
        body: form,
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error ?? "Falha ao enviar capa")
      }
      setCapaUrl(body.data.url)
      setHasCustomCapa(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload")
    } finally {
      setUploadingCapa(false)
    }
  }

  const handleResetCapa = async () => {
    if (!confirm("Voltar para a capa padrão do catálogo?")) return
    setUploadingCapa(true)
    setError(null)
    try {
      const res = await fetch(`/api/painel/cursos/${course.id}/capa`, {
        method: "DELETE",
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error ?? "Falha ao remover")
      }
      setCapaUrl(detail?.defaultCapaUrl ?? null)
      setHasCustomCapa(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover")
    } finally {
      setUploadingCapa(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const numericPrice = parseFloat(price.replace(/\./g, "").replace(",", "."))
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      setError("Preço inválido")
      setSaving(false)
      return
    }

    // Vazio é um valor válido aqui: significa "sem De". Só valida o que foi
    // digitado — e o "De" tem que ser maior que o preço de venda, senão a
    // vitrine não desenha o riscado e o ajuste passa despercebido.
    let precoDeValue: number | null = null
    if (precoDe.trim()) {
      const n = parseFloat(precoDe.replace(/\./g, "").replace(",", "."))
      if (Number.isNaN(n) || n <= 0) {
        setError("Preço de tabela inválido")
        setSaving(false)
        return
      }
      if (n <= numericPrice) {
        setError(
          'O preço de tabela precisa ser maior que o preço de venda para aparecer como "De" na vitrine.',
        )
        setSaving(false)
        return
      }
      precoDeValue = n
    }

    let parcelasValue: number | null = null
    if (parcelas.trim()) {
      const n = parseInt(parcelas, 10)
      if (Number.isNaN(n) || n < 1 || n > 24) {
        setError("Parcelas: use um número entre 1 e 24 (ou deixe vazio)")
        setSaving(false)
        return
      }
      parcelasValue = n
    }

    try {
      const response = await fetch(`/api/painel/cursos/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: numericPrice,
          precoDe: precoDeValue,
          paymentType,
          customDescription: description.trim() || null,
          // Lista vazia = volta ao padrão da PMB.
          customAprendizado: parseAprendizado(aprendizado),
          // ONE_TIME não usa parcelas por curso (o "Nx sem juros" vem do nº
          // global da unidade e o cartão vai até 12x). Limpa o valor para não
          // deixar um teto antigo/herdado preso e invisível no checkout.
          customParcelas: paymentType === "MONTHLY" ? parcelasValue : null,
          isVisible,
          isFeatured,
        }),
      })
      if (!response.ok) {
        const json = await response.json().catch(() => null)
        setError(json?.error ?? "Erro ao salvar")
        return
      }
      onSaved()
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-edit-drawer-title"
        className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2
              id="course-edit-drawer-title"
              className="text-base font-semibold text-[var(--color-pmb-green-900)]"
            >
              Editar curso
            </h2>
            <p className="text-xs text-gray-500">{course.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : (
            <>
              <div>
                <Label>Capa do curso</Label>
                <div className="relative mt-1.5">
                  <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 text-xs text-gray-500 hover:border-[var(--color-pmb-cyan)] hover:bg-[var(--color-pmb-lime-50)]/50">
                    {uploadingCapa ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Processando...</span>
                      </>
                    ) : capaUrl ? (
                      <div className="relative h-full w-full bg-white">
                        <Image
                          src={capaUrl}
                          alt={course.title}
                          fill
                          className="object-contain p-2"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <>
                        <Upload className="h-5 w-5" />
                        <span>PNG, JPG ou WEBP (max 5MB)</span>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        if (file) handleUploadCapa(file)
                        if (e.target) e.target.value = ""
                      }}
                    />
                  </label>
                  {hasCustomCapa && !uploadingCapa && (
                    <button
                      type="button"
                      onClick={handleResetCapa}
                      aria-label="Voltar para capa padrão"
                      className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-full border border-gray-300 bg-white px-2 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Padrão
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {hasCustomCapa
                    ? "Capa personalizada — só nesta vitrine."
                    : "Usando capa padrão do catálogo. Envie uma imagem para personalizar."}
                </p>
              </div>

              <div>
                <Label htmlFor="edit-descricao">Descrição customizada</Label>
                <Textarea
                  id="edit-descricao"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1.5"
                  placeholder={
                    detail?.defaultDescription
                      ? `Padrão: ${detail.defaultDescription.slice(0, 80)}...`
                      : "Deixe em branco para usar a descrição padrão."
                  }
                />
              </div>

              <div>
                <Label htmlFor="edit-aprendizado">
                  O que você vai aprender{" "}
                  <span className="text-[11px] font-normal text-gray-500">
                    (1 item por linha · até {APRENDIZADO_MAX_ITEMS})
                  </span>
                </Label>
                <Textarea
                  id="edit-aprendizado"
                  rows={6}
                  value={aprendizado}
                  onChange={(e) => setAprendizado(e.target.value)}
                  className="mt-1.5"
                  placeholder={resolveAprendizado(
                    detail?.defaultAprendizado,
                    APRENDIZADO_DEFAULT,
                  ).join("\n")}
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  {aprendizado.trim()
                    ? "Lista personalizada — vale só nesta vitrine."
                    : "Em branco: usa a lista padrão do catálogo (mostrada acima em cinza)."}
                </p>
              </div>

              <div>
                <Label>Forma de pagamento</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentType("ONE_TIME")}
                    className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                      paymentType === "ONE_TIME"
                        ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="font-bold text-[var(--color-pmb-green-900)]">
                      Pagamento único
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      À vista ou parcelado no cartão
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentType("MONTHLY")}
                    disabled={!detail?.monthlyAvailable}
                    className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                      paymentType === "MONTHLY"
                        ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    } ${!detail?.monthlyAvailable ? "cursor-not-allowed opacity-50 hover:border-gray-200" : ""}`}
                  >
                    <div className="font-bold text-[var(--color-pmb-green-900)]">
                      Mensalidade
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      Cobrança recorrente no mesmo dia
                    </div>
                  </button>
                </div>
                {!detail?.monthlyAvailable && (
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    Pagamento parcelado/mensalidade não está habilitado para sua
                    unidade. Ative em Configurações → Pagamento (mediante liberação
                    da PMB).
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="edit-preco">
                  {paymentType === "MONTHLY"
                    ? "Valor da mensalidade (R$)"
                    : "Preço total (R$)"}
                </Label>
                <Input
                  id="edit-preco"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1.5 font-mono"
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>

              <div>
                <Label htmlFor="edit-preco-de">
                  Preço de tabela — o &quot;De R$&quot; riscado{" "}
                  <span className="text-[11px] font-normal text-gray-500">
                    (opcional)
                  </span>
                </Label>
                <Input
                  id="edit-preco-de"
                  value={precoDe}
                  onChange={(e) => setPrecoDe(e.target.value)}
                  className="mt-1.5 font-mono"
                  placeholder="Vazio = sem &quot;De&quot;"
                  inputMode="decimal"
                />
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Aparece riscado antes do preço na sua vitrine. Precisa ser
                  maior que o preço acima.
                </p>
                {(() => {
                  const de = parseFloat(
                    precoDe.replace(/\./g, "").replace(",", "."),
                  )
                  const venda = parseFloat(
                    price.replace(/\./g, "").replace(",", "."),
                  )
                  if (
                    !precoDe.trim() ||
                    !Number.isFinite(de) ||
                    !Number.isFinite(venda) ||
                    venda <= 0
                  ) {
                    return null
                  }
                  if (de <= venda) {
                    return (
                      <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
                        Precisa ser maior que o preço de venda — do contrário a
                        vitrine não exibe o &quot;De&quot;.
                      </p>
                    )
                  }
                  const off = Math.round(((de - venda) / de) * 100)
                  return (
                    <p className="mt-1.5 text-[11px] text-[var(--color-pmb-green-900)]">
                      Vitrine exibe{" "}
                      <span className="line-through">
                        {de.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>{" "}
                      →{" "}
                      <strong className="font-mono">
                        {venda.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </strong>{" "}
                      ({off}% OFF)
                    </p>
                  )
                })()}
              </div>

              {/* Pagamento único usa o nº GLOBAL de parcelas sem juros da unidade
                  (Configurações → Pagamento). Só a mensalidade define a
                  quantidade por curso aqui. */}
              {paymentType === "MONTHLY" && (
                <div>
                <Label htmlFor="edit-parcelas">
                  {paymentType === "MONTHLY"
                    ? "Quantidade de mensalidades"
                    : "Número de parcelas"}{" "}
                  <span className="text-[11px] font-normal text-gray-500">
                    (1 a 24
                    {detail?.defaultParcelas
                      ? ` · padrão ${detail.defaultParcelas}${
                          paymentType === "MONTHLY" ? " meses" : "x"
                        }`
                      : ""}
                    )
                  </span>
                </Label>
                <Input
                  id="edit-parcelas"
                  type="number"
                  min={1}
                  max={24}
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                  className="mt-1.5"
                  placeholder={
                    detail?.defaultParcelas
                      ? String(detail.defaultParcelas)
                      : "Ex: 12"
                  }
                />
                {(() => {
                  const numericPrice = parseFloat(
                    price.replace(/\./g, "").replace(",", "."),
                  )
                  const efetivoParcelas = parcelas.trim()
                    ? parseInt(parcelas, 10)
                    : (detail?.defaultParcelas ?? 12)
                  if (
                    !Number.isFinite(numericPrice) ||
                    numericPrice <= 0 ||
                    !efetivoParcelas ||
                    efetivoParcelas <= 0
                  ) {
                    return null
                  }
                  const fmt = (v: number) =>
                    v.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })
                  const usingDefault = parcelas.trim() === ""
                  return (
                    <div className="mt-2 rounded-lg border border-[rgba(2,89,24,0.15)] bg-[var(--color-pmb-lime-50)]/40 px-3 py-2 text-xs text-[var(--color-pmb-green-900)]">
                      {paymentType === "MONTHLY" ? (
                        <>
                          <strong>{efetivoParcelas}</strong>{" "}
                          {efetivoParcelas === 1 ? "mensalidade" : "mensalidades"}{" "}
                          de{" "}
                          <strong className="font-mono">
                            {fmt(numericPrice)}
                          </strong>
                          <div className="mt-0.5 text-[11px] text-gray-600">
                            Total ao final:{" "}
                            <span className="font-mono">
                              {fmt(numericPrice * efetivoParcelas)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <strong>{efetivoParcelas}x</strong> de{" "}
                          <strong className="font-mono">
                            {fmt(numericPrice / efetivoParcelas)}
                          </strong>{" "}
                          sem juros
                        </>
                      )}
                      {usingDefault && (
                        <span className="text-gray-500">
                          {" "}(usando padrão do catálogo)
                        </span>
                      )}
                    </div>
                  )
                })()}
                <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-[var(--color-pmb-gold)]/30 bg-[var(--color-pmb-gold-50)] px-3 py-2 text-[11px] text-[var(--color-pmb-gold-600)]">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {paymentType === "MONTHLY"
                      ? "Apenas informativo — define quantas mensalidades aparecem na vitrine."
                      : "Apenas informativo — define o texto “Nx sem juros” exibido na vitrine."}{" "}
                    O parcelamento sem juros de fato precisa ser configurado por
                    você na sua conta do <strong>Mercado Pago</strong>.
                  </span>
                </p>
                </div>
              )}

              <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    Visível na vitrine
                  </div>
                  <div className="text-xs text-gray-500">
                    {isVisible
                      ? "O curso aparece na sua vitrine."
                      : "Curso oculto — ninguém vê na sua vitrine."}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => setIsVisible(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)]"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    Destaque na vitrine
                  </div>
                  <div className="text-xs text-gray-500">
                    Mostrar este curso em destaque.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)]"
                />
              </label>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </>
          )}
        </div>

        <footer className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </footer>
      </aside>
    </div>
  )
}
