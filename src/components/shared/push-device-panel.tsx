"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Bell,
  BellOff,
  Loader2,
  Smartphone,
  Trash2,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react"
import {
  isPushSupported,
  getPushPermissionState,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/notifications/push-client"

type State = "loading" | "unsupported" | "default" | "granted" | "denied"

interface Device {
  id: string
  endpoint: string
  userAgent: string | null
  createdAt: string
  lastUsedAt: string
  failureCount: number
}

function shortDevice(ua: string | null): string {
  if (!ua) return "Dispositivo desconhecido"
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua)
  let browser = "Navegador"
  if (/Edg\//.test(ua)) browser = "Edge"
  else if (/Chrome\//.test(ua)) browser = "Chrome"
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari"
  else if (/Firefox\//.test(ua)) browser = "Firefox"
  let os = ""
  if (/Windows/.test(ua)) os = "Windows"
  else if (/Macintosh|Mac OS/.test(ua)) os = "macOS"
  else if (/Android/.test(ua)) os = "Android"
  else if (/iPhone|iPad/.test(ua)) os = "iOS"
  else if (/Linux/.test(ua)) os = "Linux"
  return `${browser}${os ? ` · ${os}` : ""}${isMobile ? " · móvel" : ""}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function PushDevicePanel() {
  const [state, setState] = useState<State>("loading")
  const [busy, setBusy] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const refreshState = useCallback(() => {
    if (!isPushSupported()) {
      setState("unsupported")
      return
    }
    setState(getPushPermissionState() as State)
  }, [])

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true)
    try {
      const res = await fetch("/api/push/devices", { cache: "no-store" })
      if (!res.ok) return
      const body = await res.json()
      setDevices((body.data?.items ?? []) as Device[])
    } finally {
      setLoadingDevices(false)
    }
  }, [])

  useEffect(() => {
    refreshState()
    loadDevices()
  }, [refreshState, loadDevices])

  async function activate() {
    setBusy(true)
    try {
      const next = await subscribeToPush()
      setState(next as State)
      await loadDevices()
    } finally {
      setBusy(false)
    }
  }

  async function deactivateAll() {
    setBusy(true)
    try {
      await unsubscribeFromPush()
      refreshState()
      await loadDevices()
    } finally {
      setBusy(false)
    }
  }

  async function removeDevice(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/push/devices/${id}`, { method: "DELETE" })
      setDevices((prev) => prev.filter((d) => d.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Push neste navegador
          </h2>
          <p className="mt-1 text-xs text-gray-600">
            Ative para receber alertas mesmo quando a aba estiver fechada.
          </p>
        </header>

        <div className="mt-4">
          {state === "loading" && (
            <p className="text-xs text-gray-500">Verificando suporte...</p>
          )}

          {state === "unsupported" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Este navegador não suporta Web Push. Em iOS, é preciso
                adicionar o site à tela inicial primeiro.
              </span>
            </div>
          )}

          {state === "denied" && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Notificações foram bloqueadas nas permissões do navegador.
                Para ativar, libere o site nas configurações do site (ícone
                ao lado da URL) e atualize a página.
              </span>
            </div>
          )}

          {(state === "default" || state === "granted") && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    state === "granted"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {state === "granted" ? (
                    <Bell className="h-5 w-5" />
                  ) : (
                    <BellOff className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {state === "granted" ? "Ativo" : "Inativo"}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {state === "granted"
                      ? "Você está recebendo push neste navegador."
                      : "Toque em ativar e aceite o prompt do navegador."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {state === "granted" ? (
                  <button
                    type="button"
                    onClick={deactivateAll}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BellOff className="h-3.5 w-3.5" />
                    )}
                    Desativar aqui
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={activate}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Bell className="h-3.5 w-3.5" />
                    )}
                    Ativar push
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Dispositivos cadastrados
          </h2>
          <p className="mt-1 text-xs text-gray-600">
            Cada navegador onde você ativou o push aparece aqui. Remova quando
            quiser parar de receber em um dispositivo específico.
          </p>
        </header>
        {loadingDevices ? (
          <div className="p-6 text-sm text-gray-500">Carregando...</div>
        ) : devices.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            Nenhum dispositivo cadastrado ainda.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-4 px-6 py-4 text-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                  <Smartphone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--color-pmb-green-900)]">
                    {shortDevice(d.userAgent)}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Último uso {fmtDate(d.lastUsedAt)} · Cadastrado em{" "}
                    {fmtDate(d.createdAt)}
                    {d.failureCount > 0
                      ? ` · ${d.failureCount} falhas recentes`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDevice(d.id)}
                  disabled={deletingId === d.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  {deletingId === d.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-lg bg-[var(--color-pmb-lime-50)] p-3 text-[11px] text-[var(--color-pmb-green-700)]">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Configurações de notificações in-app e e-mail estão no feed de
        notificações (sino no topo).
      </p>
    </div>
  )
}
