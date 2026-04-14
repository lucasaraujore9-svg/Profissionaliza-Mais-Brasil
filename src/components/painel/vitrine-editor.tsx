"use client"

import { useState } from "react"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  VitrineConfigForm,
  type VitrineConfig,
} from "./vitrine-config-form"
import { VitrinePreview } from "./vitrine-preview"

const initialConfig: VitrineConfig = {
  nome: "Educa+ Cursos",
  descricao: "Cursos profissionalizantes que aceleram sua carreira.",
  rodape: "© 2026 Educa+ Cursos — Todos os direitos reservados",
  corPrimaria: "#3B82F6",
  corSecundaria: "#6366F1",
  corAcento: "#FACC15",
}

export function VitrineEditor() {
  const [config, setConfig] = useState<VitrineConfig>(initialConfig)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <VitrineConfigForm config={config} onChange={setConfig} />

        <div className="flex justify-end">
          <Button
            size="lg"
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <Save className="mr-2 h-4 w-4" />
            Salvar mudanças
          </Button>
        </div>
      </div>

      <div className="hidden lg:block">
        <VitrinePreview config={config} />
      </div>
    </div>
  )
}
