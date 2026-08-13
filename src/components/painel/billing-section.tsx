"use client"

import { useState, type ReactNode } from "react"
import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  Unplug,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ConfigDataWithTenant } from "./config-tabs.types"
import { AsaasGatewaySection } from "./asaas-gateway-section"

/**
 * Painel de desenvolvedores do Mercado Pago ("Suas integrações"). É de lá que
 * saem TODOS os dados pedidos aqui — public key, access token, webhook e
 * assinatura secreta. Sem o link, o revendedor leigo procura as credenciais na
 * conta comum do Mercado Pago, onde elas não existem.
 */
const MP_PANEL_URL = "https://www.mercadopago.com.br/developers/panel/app"
const MP_CREDENTIALS_HELP_URL =
  "https://www.mercadopago.com.br/ajuda/onde-encontro-credenciais_20214"

interface BillingSectionProps {
  data: ConfigDataWithTenant
  onUpdate: (next: Partial<ConfigDataWithTenant>) => void
}

export function BillingSection({ data, onUpdate }: BillingSectionProps) {
  const [billingMode, setBillingMode] = useState(data.tenant.billingMode)
  const [billingSaving, setBillingSaving] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  const [monthlyEnabled, setMonthlyEnabled] = useState(data.tenant.monthlyEnabled)
  const [monthlySaving, setMonthlySaving] = useState(false)
  const [monthlyError, setMonthlyError] = useState<string | null>(null)

  const [interestFree, setInterestFree] = useState(
    data.tenant.interestFreeInstallments,
  )
  const [interestFreeSaving, setInterestFreeSaving] = useState(false)
  const [interestFreeError, setInterestFreeError] = useState<string | null>(null)
  const [interestFreeSaved, setInterestFreeSaved] = useState(false)

  const [connected, setConnected] = useState(data.tenant.mpConnected)
  const [webhookConfigured, setWebhookConfigured] = useState(
    data.tenant.mpWebhookConfigured,
  )
  const [publicKeyConfigured, setPublicKeyConfigured] = useState(
    data.tenant.mpPublicKeyConfigured,
  )
  const [tokenInput, setTokenInput] = useState("")
  const [publicKeyInput, setPublicKeyInput] = useState("")
  const [secretInput, setSecretInput] = useState("")
  const [mpSaving, setMpSaving] = useState(false)
  const [mpError, setMpError] = useState<string | null>(null)
  const [mpSuccess, setMpSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(data.tenant.mpWebhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMpError("Não foi possível copiar. Selecione e copie manualmente.")
    }
  }

  async function updateBillingMode(mode: "AUTO" | "MANUAL") {
    if (mode === billingMode) return
    setBillingSaving(true)
    setBillingError(null)
    try {
      const response = await fetch("/api/painel/config/billing-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      if (!response.ok) {
        const json = await response.json().catch(() => null)
        setBillingError(json?.error ?? "Erro ao salvar")
        return
      }
      setBillingMode(mode)
      onUpdate({ tenant: { ...data.tenant, billingMode: mode } })
    } catch {
      setBillingError("Erro de rede")
    } finally {
      setBillingSaving(false)
    }
  }

  async function toggleMonthly(next: boolean) {
    setMonthlySaving(true)
    setMonthlyError(null)
    try {
      const response = await fetch("/api/painel/config/mensalidade", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        setMonthlyError(json?.error ?? "Erro ao salvar")
        return
      }
      setMonthlyEnabled(next)
      onUpdate({ tenant: { ...data.tenant, monthlyEnabled: next } })
    } catch {
      setMonthlyError("Erro de rede")
    } finally {
      setMonthlySaving(false)
    }
  }

  async function saveInterestFree(next: number) {
    setInterestFreeSaving(true)
    setInterestFreeError(null)
    setInterestFreeSaved(false)
    try {
      const response = await fetch("/api/painel/config/parcelamento", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interestFreeInstallments: next }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        setInterestFreeError(json?.error ?? "Erro ao salvar")
        return
      }
      setInterestFree(next)
      setInterestFreeSaved(true)
      setTimeout(() => setInterestFreeSaved(false), 2000)
      onUpdate({
        tenant: { ...data.tenant, interestFreeInstallments: next },
      })
    } catch {
      setInterestFreeError("Erro de rede")
    } finally {
      setInterestFreeSaving(false)
    }
  }

  async function connectMp() {
    setMpError(null)
    setMpSuccess(null)
    // A validação segue a MESMA ordem dos passos na tela (Public Key → Access
    // Token → assinatura). Validar o token primeiro apontava para o passo 3
    // quando o campo vazio era o do passo 2.
    const publicKey = publicKeyInput.trim()
    if (publicKey.length < 10) {
      setMpError(
        "Passo 2: cole a Public Key de produção (ela monta o pagamento dentro da sua loja).",
      )
      return
    }
    if (tokenInput.trim().length < 10) {
      setMpError("Passo 3: cole o Access Token de produção (começa com APP_USR-).")
      return
    }
    const secret = secretInput.trim()
    if (secret && secret.length < 16) {
      setMpError(
        "Passo 5: a assinatura secreta parece incompleta. Copie o valor inteiro no Mercado Pago.",
      )
      return
    }
    setMpSaving(true)
    try {
      const response = await fetch("/api/painel/config/connect-mp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: tokenInput.trim(),
          publicKey,
          ...(secret ? { webhookSecret: secret } : {}),
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        setMpError(json?.error ?? "Erro ao conectar")
        return
      }
      setConnected(true)
      setWebhookConfigured(Boolean(secret))
      setPublicKeyConfigured(true)
      setTokenInput("")
      setPublicKeyInput("")
      setSecretInput("")
      setMpSuccess(
        secret
          ? "Mercado Pago conectado com sucesso. Sua loja já pode receber pagamentos."
          : "Credenciais salvas. Falta a assinatura secreta do webhook (passos 4 e 5) para as vendas serem confirmadas automaticamente.",
      )
      onUpdate({
        tenant: {
          ...data.tenant,
          mpConnected: true,
          mpWebhookConfigured: Boolean(secret),
          mpPublicKeyConfigured: true,
        },
      })
    } catch {
      setMpError("Erro de rede")
    } finally {
      setMpSaving(false)
    }
  }

  // Atualiza apenas a assinatura secreta de quem já conectou o token.
  async function saveSecret() {
    setMpError(null)
    setMpSuccess(null)
    const secret = secretInput.trim()
    if (secret.length < 16) {
      setMpError(
        "A assinatura secreta parece incompleta. Copie o valor inteiro no Mercado Pago.",
      )
      return
    }
    setMpSaving(true)
    try {
      const response = await fetch("/api/painel/config/connect-mp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookSecret: secret }),
      })
      const json = await response.json()
      if (!response.ok) {
        setMpError(json?.error ?? "Erro ao salvar")
        return
      }
      setWebhookConfigured(true)
      setSecretInput("")
      setMpSuccess(
        "Assinatura secreta cadastrada. As vendas passam a ser confirmadas automaticamente.",
      )
      onUpdate({
        tenant: { ...data.tenant, mpWebhookConfigured: true },
      })
    } catch {
      setMpError("Erro de rede")
    } finally {
      setMpSaving(false)
    }
  }

  // Atualiza apenas a public key de quem já conectou o token antes do checkout
  // transparente existir (campo necessário para montar o formulário de cartão).
  async function savePublicKey() {
    setMpError(null)
    setMpSuccess(null)
    const publicKey = publicKeyInput.trim()
    if (publicKey.length < 10) {
      setMpError(
        "Public Key inválida. Copie o valor de produção inteiro no Mercado Pago.",
      )
      return
    }
    setMpSaving(true)
    try {
      const response = await fetch("/api/painel/config/connect-mp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey }),
      })
      const json = await response.json()
      if (!response.ok) {
        setMpError(json?.error ?? "Erro ao salvar")
        return
      }
      setPublicKeyConfigured(true)
      setPublicKeyInput("")
      setMpSuccess(
        "Public Key cadastrada. O pagamento dentro da sua loja está liberado.",
      )
      onUpdate({
        tenant: { ...data.tenant, mpPublicKeyConfigured: true },
      })
    } catch {
      setMpError("Erro de rede")
    } finally {
      setMpSaving(false)
    }
  }

  async function disconnectMp() {
    setMpSaving(true)
    setMpError(null)
    setMpSuccess(null)
    try {
      const response = await fetch("/api/painel/config/connect-mp", {
        method: "DELETE",
      })
      if (!response.ok) {
        const json = await response.json().catch(() => null)
        setMpError(json?.error ?? "Erro ao desconectar")
        return
      }
      setConnected(false)
      setWebhookConfigured(false)
      setPublicKeyConfigured(false)
      onUpdate({
        tenant: {
          ...data.tenant,
          mpConnected: false,
          mpWebhookConfigured: false,
          mpPublicKeyConfigured: false,
        },
      })
    } catch {
      setMpError("Erro de rede")
    } finally {
      setMpSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Modo de cobrança inadimplentes
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Escolha como lidar com alunos que atrasarem pagamentos recorrentes.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={billingSaving}
            onClick={() => updateBillingMode("AUTO")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:opacity-60 ${
              billingMode === "AUTO"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 shadow-sm"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Automático
              </span>
              {billingMode === "AUTO" && (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Alunos inadimplentes têm o acesso bloqueado automaticamente
              após 3 dias de atraso.
            </p>
          </button>
          <button
            type="button"
            disabled={billingSaving}
            onClick={() => updateBillingMode("MANUAL")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:opacity-60 ${
              billingMode === "MANUAL"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 shadow-sm"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Manual
              </span>
              {billingMode === "MANUAL" && (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Você recebe notificação e decide quando bloquear cada aluno.
            </p>
          </button>
        </div>

        {billingError && (
          <p className="mt-3 text-xs text-red-600">{billingError}</p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Pagamento parcelado (mensalidade)
          </h3>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              data.tenant.monthlyAllowed
                ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {data.tenant.monthlyAllowed ? "Liberado" : "Indisponível"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Quando ativado, você pode marcar cursos como mensalidade em
          Catálogo → Editar curso e gerar <strong>carnês no boleto</strong> na
          venda direta. O alcance do parcelado é definido pela PMB:{" "}
          <strong className="text-[var(--color-pmb-green-900)]">
            {data.tenant.monthlyScope === "DIRECT_AND_VITRINE"
              ? "vendas diretas e vitrine"
              : "apenas vendas diretas"}
          </strong>
          .
        </p>

        {data.tenant.monthlyAllowed ? (
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
            <input
              type="checkbox"
              checked={monthlyEnabled}
              disabled={monthlySaving}
              onChange={(e) => toggleMonthly(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Habilitar pagamento parcelado nos meus cursos
              </p>
              <p className="text-xs text-gray-500">
                Cursos já marcados como mensalidade voltam a ser cobrados à vista
                se você desativar.
              </p>
            </div>
            {monthlySaving && (
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-gray-400" />
            )}
          </label>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
            O pagamento parcelado ainda não foi liberado para sua unidade. Fale
            com seu gerente PMB para habilitar.
          </div>
        )}

        {monthlyError && (
          <p className="mt-3 text-xs text-red-600">{monthlyError}</p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Parcelamento no cartão (sem juros)
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          O aluno pode parcelar a compra no cartão em até{" "}
          <strong className="text-[var(--color-pmb-green-900)]">12x</strong>.
          Escolha em quantas dessas parcelas você assume o juros (parcelas{" "}
          <strong>sem juros</strong> para o aluno). Acima disso, o aluno paga o
          juros do cartão.
        </p>

        <div className="mt-5 max-w-xs">
          <Label htmlFor="interest-free">Parcelas sem juros</Label>
          <select
            id="interest-free"
            value={interestFree}
            disabled={interestFreeSaving}
            onChange={(e) => saveInterestFree(Number(e.target.value))}
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-60"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Apenas à vista (sem parcelas sem juros)" : `Até ${n}x sem juros`}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs">
          {interestFreeSaving && (
            <span className="flex items-center text-gray-500">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Salvando…
            </span>
          )}
          {interestFreeSaved && !interestFreeSaving && (
            <span className="flex items-center text-green-700">
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Salvo
            </span>
          )}
          {interestFreeError && (
            <span className="text-red-600">{interestFreeError}</span>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
          <strong>Importante:</strong> para o sem juros valer de fato, ative o
          parcelamento sem juros correspondente na sua conta do Mercado Pago. O
          valor exibido ao aluno no checkout é sempre o confirmado pelo Mercado
          Pago — se a conta não tiver o sem juros configurado, o aluno verá os
          juros do cartão mesmo dentro do limite escolhido aqui.
        </div>
      </div>

      {/* ── Mercado Pago ──────────────────────────────────────────────────
          O passo a passo segue a ORDEM REAL do painel do Mercado Pago: as duas
          credenciais de produção (Public Key e Access Token) saem da MESMA tela
          e vêm primeiro; a assinatura secreta do webhook só passa a existir
          DEPOIS de a URL de notificação ser salva lá. Pedir a assinatura antes
          mandava o revendedor procurar um valor que ainda não tinha sido
          gerado — e era o que mais travava a conexão. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#009EE3] text-sm font-bold text-white">
              MP
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Mercado Pago
              </h3>
              <p className="mt-1 text-xs text-gray-600">
                Gateway que recebe os pagamentos dos seus alunos. O dinheiro cai
                direto na <strong>sua</strong> conta do Mercado Pago.
              </p>
              {connected && webhookConfigured && publicKeyConfigured ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                  Conectado
                </span>
              ) : connected ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Conexão incompleta
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                  Não conectado
                </span>
              )}
            </div>
          </div>

          {connected && (
            <Button variant="outline" onClick={disconnectMp} disabled={mpSaving}>
              {mpSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unplug className="mr-2 h-4 w-4" />
              )}
              Desconectar
            </Button>
          )}
        </div>

        {/* Checklist do que a conexão exige — deixa explícito o que já entrou e
            o que ainda falta, em vez de um único selo "conectado". */}
        {connected && (
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {/* Mesma ordem do passo a passo: Public Key → Access Token →
                assinatura secreta. */}
            <MpChecklistItem
              done={publicKeyConfigured}
              label="Public Key"
              hint={
                publicKeyConfigured
                  ? "Pagamento dentro da sua loja."
                  : "Falta — veja o aviso abaixo."
              }
            />
            <MpChecklistItem
              done
              label="Access Token"
              hint="Cobrança criada na sua conta."
            />
            <MpChecklistItem
              done={webhookConfigured}
              label="Assinatura secreta"
              hint={
                webhookConfigured
                  ? "Matrícula automática ativa."
                  : "Falta — veja o aviso abaixo."
              }
            />
          </div>
        )}

        {!connected ? (
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:p-5">
            <p className="text-xs font-semibold text-[var(--color-pmb-green-900)]">
              Como conectar sua conta — 5 passos
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
              Você faz isso uma única vez e leva cerca de 10 minutos. Deixe esta
              página aberta: você vai alternar entre ela e o site do Mercado
              Pago. Preencha os campos na ordem em que eles aparecem.
            </p>

            <div className="mt-5 space-y-5">
              <MpStep
                number={1}
                title="Abra o painel de desenvolvedores do Mercado Pago"
              >
                <p>
                  Entre com a conta do Mercado Pago onde você quer{" "}
                  <strong>receber o dinheiro</strong>. Se ainda não tiver uma
                  aplicação criada, clique em <strong>Criar aplicação</strong>,
                  dê um nome (ex.: &ldquo;Minha escola&rdquo;) e escolha{" "}
                  <strong>Pagamentos online</strong>.
                </p>
                <a
                  href={MP_PANEL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#009EE3] px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-[#008cc8]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir o painel do Mercado Pago
                </a>
              </MpStep>

              <MpStep number={2} title="Copie a Public Key de produção">
                <p>
                  Abra a sua aplicação e, no menu lateral, clique em{" "}
                  <strong>Credenciais de produção</strong>. O primeiro campo da
                  tela é a <strong>Public Key</strong> — copie e cole abaixo.
                </p>
                <div>
                  <Label htmlFor="mp-public-key">Public Key (produção)</Label>
                  <Input
                    id="mp-public-key"
                    type="text"
                    className="mt-1.5 font-mono"
                    placeholder="APP_USR-..."
                    value={publicKeyInput}
                    onChange={(e) => setPublicKeyInput(e.target.value)}
                  />
                </div>
                <p>
                  É ela que monta a tela de pagamento dentro da{" "}
                  <strong>sua loja</strong>: o aluno paga sem ser redirecionado
                  para o site do Mercado Pago.
                </p>
              </MpStep>

              <MpStep number={3} title="Copie o Access Token de produção">
                <p>
                  Na <strong>mesma tela</strong> de credenciais, logo abaixo da
                  Public Key, está o <strong>Access Token</strong> — copie e
                  cole abaixo.
                </p>
                <div>
                  <Label htmlFor="mp-token">Access Token (produção)</Label>
                  <Input
                    id="mp-token"
                    type="password"
                    className="mt-1.5 font-mono"
                    placeholder="APP_USR-..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                </div>
                <p>
                  Ele começa com <strong>APP_USR-</strong>. Use as credenciais
                  de <strong>produção</strong>, nunca as de teste — com as de
                  teste nenhum pagamento de verdade entra. O token é
                  criptografado antes de ser salvo e ninguém da equipe vê o
                  valor.{" "}
                  <a
                    href={MP_CREDENTIALS_HELP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#009EE3] underline underline-offset-2"
                  >
                    Não está achando as credenciais?
                  </a>
                </p>
              </MpStep>

              <MpStep
                number={4}
                title="Cadastre esta URL nos Webhooks do Mercado Pago"
              >
                <p>
                  Ainda na sua aplicação, menu lateral →{" "}
                  <strong>Webhooks</strong> →{" "}
                  <strong>Configurar notificação</strong> → aba{" "}
                  <strong>Modo produção</strong>. Cole a URL abaixo no campo{" "}
                  <strong>URL</strong>, marque o evento{" "}
                  <strong>Pagamentos</strong> (marque também{" "}
                  <strong>Assinaturas</strong> se você vende curso em
                  mensalidade) e clique em <strong>Salvar</strong>.
                </p>
                <MpWebhookUrlField
                  url={data.tenant.mpWebhookUrl}
                  copied={copied}
                  onCopy={copyWebhookUrl}
                />
                <p>
                  É esse aviso que matricula o aluno automaticamente assim que o
                  pagamento é aprovado. Cole a URL <strong>inteira</strong>,
                  incluindo o trecho depois do <strong>?</strong>.
                </p>
              </MpStep>

              <MpStep
                number={5}
                title="Copie a assinatura secreta que aparece depois de salvar"
              >
                <p>
                  A <strong>assinatura secreta</strong> (o Mercado Pago também a
                  chama de <em>chave secreta</em>) só aparece{" "}
                  <strong>depois</strong> que você salva o webhook do passo 4, na
                  própria tela de Webhooks. Clique em <strong>revelar</strong>,
                  copie e cole abaixo.
                </p>
                <div>
                  <Label htmlFor="mp-secret">
                    Assinatura secreta do webhook
                  </Label>
                  <Input
                    id="mp-secret"
                    type="password"
                    className="mt-1.5 font-mono"
                    placeholder="ex.: a1b2c3d4e5f6..."
                    value={secretInput}
                    onChange={(e) => setSecretInput(e.target.value)}
                  />
                </div>
                <p>
                  Ela prova que o aviso de pagamento veio mesmo do Mercado Pago.
                  Sem ela, o aluno paga e <strong>não</strong> é matriculado
                  sozinho. Se ainda não conseguiu gerá-la, salve sem ela e volte
                  aqui depois para cadastrá-la.
                </p>
              </MpStep>
            </div>

            {mpError && <p className="mt-4 text-xs text-red-600">{mpError}</p>}

            <div className="mt-5 flex justify-end">
              <Button
                onClick={connectMp}
                disabled={mpSaving}
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                {mpSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  "Salvar e conectar Mercado Pago"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
            <Label>URL de notificação (webhook)</Label>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              Esta é a URL que precisa estar cadastrada no{" "}
              <a
                href={MP_PANEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#009EE3] underline underline-offset-2"
              >
                painel do Mercado Pago
              </a>{" "}
              → sua aplicação → <strong>Webhooks</strong>, no modo produção e
              com o evento <strong>Pagamentos</strong> marcado. É ela que avisa
              nosso sistema quando um pagamento é aprovado.
            </p>
            <div className="mt-2">
              <MpWebhookUrlField
                url={data.tenant.mpWebhookUrl}
                copied={copied}
                onCopy={copyWebhookUrl}
              />
            </div>
          </div>
        )}

        {connected && !publicKeyConfigured && (
          <div className="mt-5 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-800">
              Falta a Public Key do Mercado Pago
            </p>
            <p className="text-[11px] leading-relaxed text-amber-700">
              O Access Token está conectado, mas sem a Public Key o pagamento na
              sua loja não funciona — é ela que monta a tela de cartão para o
              aluno pagar aqui mesmo, sem ser redirecionado.
            </p>
            <div>
              <Label htmlFor="mp-public-key-only">Public Key (produção)</Label>
              <Input
                id="mp-public-key-only"
                type="text"
                className="mt-1.5 font-mono"
                placeholder="APP_USR-..."
                value={publicKeyInput}
                onChange={(e) => setPublicKeyInput(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-amber-700">
                Onde achar:{" "}
                <a
                  href={MP_PANEL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  painel do Mercado Pago
                </a>{" "}
                → sua aplicação → <strong>Credenciais de produção</strong> →
                primeiro campo, <strong>Public Key</strong>.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={savePublicKey}
                disabled={mpSaving}
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                {mpSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Public Key"
                )}
              </Button>
            </div>
          </div>
        )}

        {connected && !webhookConfigured && (
          <div className="mt-5 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-800">
              Falta a assinatura secreta do webhook
            </p>
            <p className="text-[11px] leading-relaxed text-amber-700">
              As credenciais estão conectadas, mas sem a assinatura secreta o
              Mercado Pago não consegue confirmar as vendas — os alunos pagam e
              não são matriculados automaticamente.
            </p>
            <div>
              <Label htmlFor="mp-secret-only">
                Assinatura secreta do webhook
              </Label>
              <Input
                id="mp-secret-only"
                type="password"
                className="mt-1.5 font-mono"
                placeholder="ex.: a1b2c3d4e5f6..."
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                Onde achar:{" "}
                <a
                  href={MP_PANEL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  painel do Mercado Pago
                </a>{" "}
                → sua aplicação → <strong>Webhooks</strong>. Cadastre ali a URL
                de notificação acima (modo produção, evento{" "}
                <strong>Pagamentos</strong>) e salve: a{" "}
                <strong>assinatura secreta</strong> só aparece depois de salvar.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={saveSecret}
                disabled={mpSaving}
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                {mpSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar assinatura secreta"
                )}
              </Button>
            </div>
          </div>
        )}

        {mpSuccess && (
          <p className="mt-3 text-xs text-green-700">{mpSuccess}</p>
        )}
        {connected && mpError && (
          <p className="mt-3 text-xs text-red-600">{mpError}</p>
        )}
      </div>

      {/* Gateway Asaas — disponível para TODA unidade (deixou de ser capability
          liberada caso a caso pelo Admin Master). Aqui ela conecta a conta e
          escolhe qual dos dois gateways fica ativo. O gate de render é o mesmo
          do guard das rotas (`gateway.manage`): sem ele a pessoa digitaria a
          API key e o token só para levar 403 ao salvar. */}
      {data.canManagePix && (
        <AsaasGatewaySection data={data} onUpdate={onUpdate} />
      )}
    </div>
  )
}

/** Passo numerado do tutorial de conexão do Mercado Pago. */
function MpStep({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#009EE3] text-[11px] font-bold text-white">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[var(--color-pmb-green-900)]">
          {title}
        </p>
        <div className="mt-1.5 space-y-2 text-[11px] leading-relaxed text-gray-600">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * URL de notificação + botão de copiar. Aparece no passo 4 do tutorial e no
 * card de quem já conectou (para conferir o que está cadastrado no MP).
 */
function MpWebhookUrlField({
  url,
  copied,
  onCopy,
}: {
  url: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-[11px] text-gray-700">
        {url}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCopy}
        className="shrink-0"
      >
        {copied ? (
          <>
            <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
            Copiado
          </>
        ) : (
          <>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copiar
          </>
        )}
      </Button>
    </div>
  )
}

/** Item do checklist de requisitos da conexão (token / public key / assinatura). */
function MpChecklistItem({
  done,
  label,
  hint,
}: {
  done: boolean
  label: string
  hint: string
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-2.5 ${
        done
          ? "border-green-200 bg-green-50/60"
          : "border-amber-200 bg-amber-50/60"
      }`}
    >
      {done ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
      ) : (
        <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      )}
      <div className="min-w-0">
        <p
          className={`text-[11px] font-semibold ${
            done ? "text-green-800" : "text-amber-800"
          }`}
        >
          {label}
        </p>
        <p className={`text-[10px] ${done ? "text-green-700" : "text-amber-700"}`}>
          {hint}
        </p>
      </div>
    </div>
  )
}
