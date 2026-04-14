"use client"

import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function FormularioInteresse() {
  return (
    <section id="formulario" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-[#FAFAFA] to-white shadow-sm">
          <div className="p-6 md:p-10 lg:p-12">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-[#1A1A2E] md:text-3xl">
                Pronto pra começar?
              </h2>
              <p className="mt-3 text-gray-600">
                Preencha o formulário e um consultor entra em contato pra te ajudar a escolher o plano ideal.
              </p>
            </div>

            <form
              className="mt-8 space-y-5"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email profissional</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@empresa.com.br"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="empresa">Nome da empresa ou escola</Label>
                <Input
                  id="empresa"
                  type="text"
                  placeholder="Ex: Escola Excel Pro"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
                <Input
                  id="telefone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full bg-blue-600 text-white hover:bg-blue-700"
              >
                Quero Começar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <p className="text-center text-xs text-gray-500">
                Seus dados estão seguros. Nunca compartilhamos informações com terceiros.
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
