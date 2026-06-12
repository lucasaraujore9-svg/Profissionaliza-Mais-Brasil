"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Eye, EyeOff, KeyRound, Mail, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { suggestPassword } from "@/lib/suggest-password"

export type CreateMode = "invite" | "password"

/** Alterna entre enviar convite por link ou gerar senha já na criação. */
export function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: CreateMode
  onChange: (m: CreateMode) => void
  disabled?: boolean
}) {
  return (
    <div>
      <Label>Como dar acesso</Label>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("invite")}
          className={`flex items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-60 ${
            mode === "invite"
              ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]/5"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" />
          <span>
            <span className="block font-medium">Convite por link</span>
            <span className="block text-xs text-muted-foreground">
              O usuário define a própria senha
            </span>
          </span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("password")}
          className={`flex items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-60 ${
            mode === "password"
              ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]/5"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" />
          <span>
            <span className="block font-medium">Gerar senha</span>
            <span className="block text-xs text-muted-foreground">
              Enviada por email; troca no 1º acesso
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}

/** Campo de senha com botões "gerar" e mostrar/ocultar. */
export function PasswordField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <Label>Senha</Label>
      <div className="mt-1.5 flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Digite ou gere uma senha"
            autoComplete="new-password"
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            onChange(suggestPassword())
            setShow(true)
          }}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Gerar
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Mínimo 8 caracteres. Deixe vazio para gerar automaticamente ao salvar.
      </p>
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-white px-2 py-1.5 text-sm">
          {value}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              toast.success(`${label} copiado`)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              toast.error("Não foi possível copiar")
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

/** Painel exibido após criar a conta no modo "gerar senha". */
export function CredentialsResultPanel({
  email,
  password,
  emailSent,
}: {
  email: string
  password: string
  emailSent: boolean
}) {
  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg border p-3 text-sm ${
          emailSent
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        {emailSent
          ? "Credenciais enviadas por email. Anote ou copie abaixo para repassar também."
          : "O email não pôde ser enviado agora. Copie as credenciais abaixo e repasse manualmente."}
      </div>
      <div className="space-y-3 rounded-lg border bg-[var(--color-pmb-mist)] p-3">
        <CopyRow label="Email" value={email} />
        <CopyRow label="Senha" value={password} />
      </div>
      <p className="text-xs text-muted-foreground">
        Por segurança, o usuário será solicitado a trocar a senha no primeiro acesso.
      </p>
    </div>
  )
}
