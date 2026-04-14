"use client"

import { useState } from "react"
import { CheckCircle2 } from "lucide-react"

export function ResellerPolicyConfig() {
  const [mode, setMode] = useState<"auto" | "manual">("auto")

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Modo de bloqueio</h3>
      <p className="mt-1 text-xs text-gray-600">
        Define como a plataforma lida com alunos inadimplentes deste revendedor.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("auto")}
          className={`rounded-xl border-2 p-4 text-left transition-all ${
            mode === "auto"
              ? "border-blue-600 bg-blue-50/50"
              : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1A1A2E]">Automático</span>
            {mode === "auto" && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Bloqueia aluno 3 dias após atraso, via API EA.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-xl border-2 p-4 text-left transition-all ${
            mode === "manual"
              ? "border-blue-600 bg-blue-50/50"
              : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1A1A2E]">Manual</span>
            {mode === "manual" && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Admin e revendedor recebem aviso para decidir.
          </p>
        </button>
      </div>
    </div>
  )
}
