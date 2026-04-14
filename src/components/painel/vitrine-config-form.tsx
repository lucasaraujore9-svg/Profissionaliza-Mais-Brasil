"use client"

import { Upload, Image as ImageIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface VitrineConfig {
  nome: string
  descricao: string
  rodape: string
  corPrimaria: string
  corSecundaria: string
  corAcento: string
}

interface VitrineConfigFormProps {
  config: VitrineConfig
  onChange: (config: VitrineConfig) => void
}

export function VitrineConfigForm({ config, onChange }: VitrineConfigFormProps) {
  const update = <K extends keyof VitrineConfig>(
    key: K,
    value: VitrineConfig[K],
  ) => {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Identidade visual</h3>
        <p className="mt-1 text-xs text-gray-600">
          Envie os elementos gráficos da sua marca.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Logo</Label>
            <label className="mt-1.5 flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 text-xs text-gray-500 transition-colors hover:border-blue-400 hover:bg-blue-50/50">
              <Upload className="h-5 w-5" />
              <span>Arraste ou clique (PNG, SVG)</span>
              <input type="file" className="hidden" accept="image/*" />
            </label>
          </div>
          <div>
            <Label>Banner hero</Label>
            <label className="mt-1.5 flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 text-xs text-gray-500 transition-colors hover:border-blue-400 hover:bg-blue-50/50">
              <ImageIcon className="h-5 w-5" />
              <span>Recomendado 1920×600</span>
              <input type="file" className="hidden" accept="image/*" />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Paleta de cores</h3>
        <p className="mt-1 text-xs text-gray-600">
          As cores serão aplicadas no tempo real do preview ao lado.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {(
            [
              { key: "corPrimaria", label: "Primária" },
              { key: "corSecundaria", label: "Secundária" },
              { key: "corAcento", label: "Acento" },
            ] as const
          ).map((field) => (
            <div key={field.key}>
              <Label htmlFor={field.key}>{field.label}</Label>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
                <input
                  id={field.key}
                  type="color"
                  value={config[field.key]}
                  onChange={(e) => update(field.key, e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
                />
                <span className="font-mono text-xs font-semibold text-[#1A1A2E]">
                  {config[field.key].toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Textos</h3>
        <p className="mt-1 text-xs text-gray-600">
          O que aparece na vitrine do seu aluno.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="v-nome">Nome da loja</Label>
            <Input
              id="v-nome"
              value={config.nome}
              onChange={(e) => update("nome", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-desc">Descrição curta</Label>
            <Textarea
              id="v-desc"
              rows={3}
              value={config.descricao}
              onChange={(e) => update("descricao", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-rodape">Rodapé customizado</Label>
            <Input
              id="v-rodape"
              value={config.rodape}
              onChange={(e) => update("rodape", e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
      </section>
    </div>
  )
}
