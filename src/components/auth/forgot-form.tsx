"use client"

import Link from "next/link"
import { Mail, ArrowLeft, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ForgotForm() {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="email">Email cadastrado</Label>
        <div className="relative mt-1.5">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="email"
            type="email"
            placeholder="voce@empresa.com"
            className="pl-9"
            autoComplete="email"
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Enviaremos um link para redefinir sua senha em instantes.
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full bg-blue-600 text-white hover:bg-blue-700"
      >
        <Send className="mr-2 h-4 w-4" />
        Enviar link de redefinição
      </Button>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#1A1A2E]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para o login
      </Link>
    </form>
  )
}
