"use client"

import Link from "next/link"
import { Mail, Lock, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="email">Email</Label>
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
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Senha</Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Esqueci minha senha
          </Link>
        </div>
        <div className="relative mt-1.5">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="password"
            type="password"
            placeholder="Sua senha"
            className="pl-9"
            autoComplete="current-password"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Lembrar-me neste dispositivo
      </label>

      <Button
        type="submit"
        size="lg"
        className="w-full bg-blue-600 text-white hover:bg-blue-700"
      >
        Entrar
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      <p className="text-center text-sm text-gray-600">
        Ainda não tem conta?{" "}
        <Link
          href="/seja-revendedor"
          className="font-medium text-blue-600 hover:text-blue-700"
        >
          Seja revendedor
        </Link>
      </p>
    </form>
  )
}
