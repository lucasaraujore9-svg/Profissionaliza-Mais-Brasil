"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SubmitStatus = "idle" | "submitting" | "success" | "error"

export function SecurityForm() {
  const [current, setCurrent] = useState("")
  const [newPass, setNewPass] = useState("")
  const [confirm, setConfirm] = useState("")
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrors({})
    setErrorMessage(null)

    try {
      const response = await fetch("/api/painel/config/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: newPass,
          confirmPassword: confirm,
        }),
      })
      const json = await response.json()

      if (!response.ok) {
        if (json?.fields) {
          const flat: Record<string, string> = {}
          for (const [field, list] of Object.entries(
            json.fields as Record<string, string[] | undefined>,
          )) {
            if (list && list[0]) flat[field] = list[0]
          }
          setErrors(flat)
        }
        setErrorMessage(json?.error ?? "Erro ao atualizar senha")
        setStatus("error")
        return
      }

      setCurrent("")
      setNewPass("")
      setConfirm("")
      setStatus("success")
    } catch {
      setErrorMessage("Erro de rede. Tente novamente.")
      setStatus("error")
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8"
    >
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Alterar senha</h3>
      <p className="mt-1 text-xs text-gray-600">
        Use uma senha forte com pelo menos 8 caracteres.
      </p>

      <div className="mt-6 space-y-4 max-w-md">
        <div>
          <Label htmlFor="sec-atual">Senha atual</Label>
          <div className="relative mt-1.5">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="sec-atual"
              type="password"
              placeholder="••••••••"
              className="pl-9"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          {errors.currentPassword && (
            <p className="mt-1 text-xs text-red-600">{errors.currentPassword}</p>
          )}
        </div>
        <div>
          <Label htmlFor="sec-nova">Nova senha</Label>
          <div className="relative mt-1.5">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="sec-nova"
              type="password"
              placeholder="Mínimo 8 caracteres"
              className="pl-9"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
          </div>
          {errors.newPassword && (
            <p className="mt-1 text-xs text-red-600">{errors.newPassword}</p>
          )}
        </div>
        <div>
          <Label htmlFor="sec-confirm">Confirmar nova senha</Label>
          <div className="relative mt-1.5">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="sec-confirm"
              type="password"
              placeholder="Repita a nova senha"
              className="pl-9"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {status === "success" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Senha atualizada com sucesso.
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button
          type="submit"
          disabled={status === "submitting"}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Atualizando...
            </>
          ) : (
            "Atualizar senha"
          )}
        </Button>
      </div>
    </form>
  )
}
