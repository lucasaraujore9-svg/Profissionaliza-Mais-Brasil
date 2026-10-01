"use client"

import { useRef, useState } from "react"
import { Upload, Loader2, Trash2, ChevronDown, AlertTriangle } from "lucide-react"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  resolveTheme,
  themeWarnings,
  type TenantTheme,
  type ThemeColorKey,
  type Tone,
} from "@/lib/tenant/theme"

export interface VitrineConfig {
  name: string
  tagline: string | null
  description: string | null
  logoUrl: string | null
  logoDarkUrl: string | null
  faviconUrl: string | null
  appIconUrl: string | null
  primaryColor: string
  secondaryColor: string
  theme: TenantTheme
  whatsapp: string | null
  whatsappFloatEnabled: boolean
  whatsappFloatSide: "right" | "left"
  whatsappFloatMessage: string | null
  instagram: string | null
  facebook: string | null
  youtube: string | null
  tiktok: string | null
  supportEmail: string | null
  supportHours: string | null
}

export type VitrineAssetKind = "logo" | "logodark" | "favicon" | "appicon"

const ASSET_LABEL: Record<VitrineAssetKind, string> = {
  logo: "a logo",
  logodark: "a logo para fundo escuro",
  favicon: "o favicon",
  appicon: "o ícone do app",
}

interface VitrineConfigFormProps {
  config: VitrineConfig
  onChange: (config: VitrineConfig) => void
  onUpload: (kind: VitrineAssetKind, file: File) => Promise<void>
  onRemove: (kind: VitrineAssetKind) => Promise<void>
  uploading: VitrineAssetKind | null
}

export function VitrineConfigForm({
  config,
  onChange,
  onUpload,
  onRemove,
  uploading,
}: VitrineConfigFormProps) {
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Qual asset o diálogo de confirmação está prestes a remover (null = fechado).
  const [removeKind, setRemoveKind] = useState<VitrineAssetKind | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const logoDarkInputRef = useRef<HTMLInputElement | null>(null)
  const faviconInputRef = useRef<HTMLInputElement | null>(null)
  const appIconInputRef = useRef<HTMLInputElement | null>(null)

  const update = <K extends keyof VitrineConfig>(
    key: K,
    value: VitrineConfig[K],
  ) => {
    onChange({ ...config, [key]: value })
  }

  const updateTheme = <K extends keyof TenantTheme>(key: K, value: TenantTheme[K]) => {
    onChange({ ...config, theme: { ...config.theme, [key]: value } })
  }

  // Mesma conta que a loja faz: o que aparece como "automático" aqui é
  // exatamente a cor que vai para a página.
  const resolved = resolveTheme(config)
  const warnings = themeWarnings(config)
  const isAuto = (...keys: ThemeColorKey[]) => keys.every((k) => config.theme[k] === null)

  async function handleFile(kind: VitrineAssetKind, file: File | null) {
    if (!file) return
    setUploadError(null)
    try {
      await onUpload(kind, file)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro no upload")
    }
  }

  async function confirmRemove() {
    if (!removeKind) return
    const kind = removeKind
    setUploadError(null)
    setRemoveKind(null)
    try {
      await onRemove(kind)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro ao remover")
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Identidade visual</h3>
        <p className="mt-1 text-xs text-gray-600">
          Envie os elementos gráficos da sua marca.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <AssetUploader
            label="Logo para fundo claro"
            hint="PNG com fundo transparente • horizontal, ideal 480 × 160 px (mín. 200 × 200 px se quadrada) • máx 5MB"
            previewUrl={config.logoUrl}
            uploading={uploading === "logo"}
            inputRef={logoInputRef}
            onChoose={(file) => handleFile("logo", file)}
            onRemove={() => setRemoveKind("logo")}
          />
          <AssetUploader
            label="Logo para fundo escuro"
            hint="Versão clara (branca) da sua logo • PNG com fundo transparente • opcional"
            previewUrl={config.logoDarkUrl}
            previewBackground={resolved.dark}
            uploading={uploading === "logodark"}
            inputRef={logoDarkInputRef}
            onChoose={(file) => handleFile("logodark", file)}
            onRemove={() => setRemoveKind("logodark")}
          />
          <AssetUploader
            label="Favicon"
            hint="PNG quadrado com fundo transparente • ideal 512 × 512 px • máx 5MB"
            previewUrl={config.faviconUrl}
            uploading={uploading === "favicon"}
            inputRef={faviconInputRef}
            onChoose={(file) => handleFile("favicon", file)}
            onRemove={() => setRemoveKind("favicon")}
          />
          <AssetUploader
            label="Ícone do app"
            hint="PNG ou WEBP quadrado • ideal 512 × 512 px • máx 5MB"
            accept="image/png,image/webp"
            previewUrl={config.appIconUrl}
            uploading={uploading === "appicon"}
            inputRef={appIconInputRef}
            onChoose={(file) => handleFile("appicon", file)}
            onRemove={() => setRemoveKind("appicon")}
          />
        </div>

        <p className="mt-3 text-[11px] text-gray-500">
          A <strong className="font-semibold text-[var(--color-pmb-green-900)]">logo para fundo escuro</strong>{" "}
          aparece no rodapé, no topo escuro e na tela de login. Se você não
          enviar, usamos a logo principal dentro de uma placa branca.
        </p>

        <p className="mt-3 text-[11px] text-gray-500">
          O <strong className="font-semibold text-[var(--color-pmb-green-900)]">ícone do app</strong>{" "}
          é o que fica na tela inicial do celular de quem instala a sua loja.
          Envie o símbolo da sua marca em PNG ou WEBP: o fundo é escolhido
          sozinho — logo clara ganha fundo escuro, logo escura ganha fundo claro
          — e a imagem é recortada em 512 × 512 px com margem de segurança.
          Sem ícone próprio, usamos a favicon e, na falta dela, a logo.
        </p>

        <p className="mt-3 text-[11px] text-gray-500">
          O favicon é o ícone que aparece na aba do navegador e no atalho quando
          alguém instala sua vitrine no celular. Como ele é desenhado bem pequeno
          (32 × 32 px), use um símbolo quadrado — uma logo horizontal costuma
          ficar ilegível nesse tamanho. Sem favicon própria, usamos a sua logo.
        </p>

        <p className="mt-4 rounded-lg border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-lime-50)]/50 px-3 py-2 text-xs text-gray-600">
          Para personalizar o banner principal (hero) da sua vitrine, adicione
          imagens na aba <strong className="font-semibold text-[var(--color-pmb-green-900)]">Banner principal</strong>.
          Com 1 imagem o banner é único; com mais de uma vira um carrossel.
        </p>

        {uploadError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {uploadError}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Cores da marca</h3>
        <p className="mt-1 text-xs text-gray-600">
          Escolha só estas duas cores: o sistema monta o resto sozinho e cuida
          para o texto ficar sempre legível. Valem para a loja, o login, o
          pagamento e a área do aluno.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ColorField
            id="primary-color"
            label="Cor principal"
            value={config.primaryColor}
            onChange={(v) => update("primaryColor", v)}
          />
          <ColorField
            id="secondary-color"
            label="Cor de destaque"
            value={config.secondaryColor}
            onChange={(v) => update("secondaryColor", v)}
          />
        </div>

        {warnings.length > 0 && (
          <ul className="mt-4 space-y-2">
            {warnings.map((w) => (
              <li
                key={w.fix}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="flex-1">{w.message}</span>
                <button
                  type="button"
                  onClick={() => updateTheme(w.fix, null)}
                  className="font-semibold underline underline-offset-2"
                >
                  Corrigir para mim
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-xs font-semibold text-[var(--color-pmb-green-900)]">
          Ajustes opcionais
        </p>
        <p className="mt-1 text-xs text-gray-600">
          Quer uma cor diferente em algum lugar? Abra o item e troque. Tudo que
          você não mexer continua no automático.
        </p>

        <div className="mt-3 space-y-2">
          <ThemeBlock
            title="Botões"
            description="A cor dos botões da loja e da área do aluno."
            auto={isAuto("buttonBg", "buttonText", "ctaBg", "ctaText")}
          >
            <ButtonGroup title="Botões de destaque" example="Comprar, Quero estudar">
              <AutoColorField
                id="cta-bg"
                label="Cor do botão"
                value={config.theme.ctaBg}
                auto={resolved.cta}
                onChange={(v) => updateTheme("ctaBg", v)}
              />
              <AutoColorField
                id="cta-text"
                label="Cor do texto"
                value={config.theme.ctaText}
                auto={resolved.ctaOn}
                onChange={(v) => updateTheme("ctaText", v)}
              />
            </ButtonGroup>
            <ButtonGroup title="Botões comuns" example="Entrar, Pagar, Continuar">
              <AutoColorField
                id="btn-bg"
                label="Cor do botão"
                value={config.theme.buttonBg}
                auto={resolved.btn}
                onChange={(v) => updateTheme("buttonBg", v)}
              />
              <AutoColorField
                id="btn-text"
                label="Cor do texto"
                value={config.theme.buttonText}
                auto={resolved.btnOn}
                onChange={(v) => updateTheme("buttonText", v)}
              />
            </ButtonGroup>
          </ThemeBlock>

          <ThemeBlock
            title="Áreas claras"
            description="Partes de fundo branco: lista de cursos, páginas, formulários."
            auto={isAuto("lightTitle")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <AutoColorField
                id="light-title"
                label="Cor dos títulos e links"
                value={config.theme.lightTitle}
                auto={resolved.ink}
                onChange={(v) => updateTheme("lightTitle", v)}
              />
            </div>
          </ThemeBlock>

          <ThemeBlock
            title="Áreas escuras"
            description="Faixas coloridas: rodapé, banners e topo das páginas."
            auto={isAuto("darkBg", "darkText")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <AutoColorField
                id="dark-bg"
                label="Cor do fundo"
                value={config.theme.darkBg}
                auto={resolved.dark}
                onChange={(v) => updateTheme("darkBg", v)}
              />
              <AutoColorField
                id="dark-text"
                label="Cor do texto"
                value={config.theme.darkText}
                auto={resolved.darkOn}
                onChange={(v) => updateTheme("darkText", v)}
              />
            </div>
          </ThemeBlock>

          <ThemeBlock
            title="Claro ou escuro"
            description="Escolha se o topo, o rodapé e o menu do aluno são claros ou escuros."
            auto={
              config.theme.headerTone === "light" &&
              config.theme.footerTone === "dark" &&
              config.theme.studentMenuTone === "dark"
            }
            autoLabel="Padrão"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <ToneField
                label="Topo da loja"
                value={config.theme.headerTone}
                onChange={(v) => updateTheme("headerTone", v)}
              />
              <ToneField
                label="Rodapé da loja"
                value={config.theme.footerTone}
                onChange={(v) => updateTheme("footerTone", v)}
              />
              <ToneField
                label="Menu da área do aluno"
                value={config.theme.studentMenuTone}
                onChange={(v) => updateTheme("studentMenuTone", v)}
              />
            </div>
          </ThemeBlock>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Textos</h3>
        <p className="mt-1 text-xs text-gray-600">
          O que aparece na vitrine do seu aluno.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="v-nome">Nome da loja</Label>
            <Input
              id="v-nome"
              value={config.name}
              onChange={(e) => update("name", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-tagline">Frase curta (tagline)</Label>
            <Input
              id="v-tagline"
              value={config.tagline ?? ""}
              onChange={(e) => update("tagline", e.target.value || null)}
              placeholder="Ex: Cursos que aceleram sua carreira"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-desc">Descrição</Label>
            <Textarea
              id="v-desc"
              rows={3}
              value={config.description ?? ""}
              onChange={(e) => update("description", e.target.value || null)}
              className="mt-1.5"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Contato e redes</h3>
        <p className="mt-1 text-xs text-gray-600">
          Aparece no rodapé da vitrine.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="v-wa">WhatsApp</Label>
            <Input
              id="v-wa"
              value={config.whatsapp ?? ""}
              onChange={(e) => update("whatsapp", e.target.value || null)}
              placeholder="(11) 99999-9999"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-ig">Instagram</Label>
            <Input
              id="v-ig"
              value={config.instagram ?? ""}
              onChange={(e) => update("instagram", e.target.value || null)}
              placeholder="@sualoja"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-fb">Facebook</Label>
            <Input
              id="v-fb"
              value={config.facebook ?? ""}
              onChange={(e) => update("facebook", e.target.value || null)}
              placeholder="sualoja"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-yt">YouTube</Label>
            <Input
              id="v-yt"
              value={config.youtube ?? ""}
              onChange={(e) => update("youtube", e.target.value || null)}
              placeholder="@sualoja"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-tt">TikTok</Label>
            <Input
              id="v-tt"
              value={config.tiktok ?? ""}
              onChange={(e) => update("tiktok", e.target.value || null)}
              placeholder="@sualoja"
              className="mt-1.5"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="v-email">E-mail de atendimento</Label>
            <Input
              id="v-email"
              type="email"
              value={config.supportEmail ?? ""}
              onChange={(e) => update("supportEmail", e.target.value || null)}
              placeholder="atendimento@sualoja.com.br"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-hours">Horário de atendimento</Label>
            <Input
              id="v-hours"
              value={config.supportHours ?? ""}
              onChange={(e) => update("supportHours", e.target.value || null)}
              placeholder="Segunda a sexta, 9h às 18h"
              className="mt-1.5"
            />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
          Deixe em branco para esconder a linha no rodapé. O horário de
          atendimento também aparece na barra de benefícios da vitrine. Os dados
          da Profissionaliza Mais Brasil não aparecem na sua vitrine.
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              Botão flutuante de WhatsApp
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              Exibe um botão fixo na vitrine que abre uma conversa no WhatsApp
              com o número informado acima.
            </p>
          </div>
          <Switch
            checked={config.whatsappFloatEnabled}
            onCheckedChange={(v) => update("whatsappFloatEnabled", v)}
            aria-label="Ativar botão flutuante de WhatsApp"
          />
        </div>

        {config.whatsappFloatEnabled && (
          <div className="mt-5 space-y-4">
            {!config.whatsapp?.trim() && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Preencha o campo <strong>WhatsApp</strong> acima para o botão
                aparecer na vitrine. Vale celular, telefone fixo ou 0800 — desde
                que o número tenha WhatsApp Business ativo.
              </div>
            )}

            <div>
              <Label>Posição do botão</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <SideOption
                  label="Inferior esquerdo"
                  active={config.whatsappFloatSide === "left"}
                  onClick={() => update("whatsappFloatSide", "left")}
                />
                <SideOption
                  label="Inferior direito"
                  active={config.whatsappFloatSide === "right"}
                  onClick={() => update("whatsappFloatSide", "right")}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="v-wa-msg">Mensagem pré-preenchida</Label>
              <Textarea
                id="v-wa-msg"
                rows={2}
                maxLength={300}
                value={config.whatsappFloatMessage ?? ""}
                onChange={(e) =>
                  update("whatsappFloatMessage", e.target.value || null)
                }
                placeholder="Olá! Vi sua loja e gostaria de saber mais sobre os cursos."
                className="mt-1.5"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Aparece já digitada na conversa quando o visitante toca no botão.
                Deixe em branco para abrir o WhatsApp sem mensagem.
              </p>
            </div>
          </div>
        )}
      </section>

      <AlertDialog
        open={removeKind !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveKind(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover {removeKind ? ASSET_LABEL[removeKind] : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeKind === "favicon"
                ? "A aba do navegador voltará a usar a sua logo como ícone. Se você também não tiver logo, o navegador exibe o ícone padrão dele."
                : removeKind === "appicon"
                  ? "Quem instalar a loja no celular a partir de agora verá a sua favicon (ou a logo) como ícone. Quem já instalou continua com o ícone atual até reinstalar."
                  : removeKind === "logodark"
                    ? "As áreas escuras voltarão a usar a logo principal dentro de uma placa branca."
                    : "A vitrine voltará a exibir o nome da loja sem logo até você enviar uma nova imagem."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmRemove()
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface AssetUploaderProps {
  label: string
  hint: string
  // O ícone do app é recomposto no browser antes de subir (canvas), e o canvas
  // só devolve PNG: aceitar JPG aqui deixaria o aluno com o fundo branco do JPG
  // por baixo do fundo escolhido.
  accept?: string
  previewUrl: string | null
  /** Fundo da prévia — a logo de fundo escuro precisa ser vista sobre ele. */
  previewBackground?: string
  uploading: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onChoose: (file: File | null) => void
  onRemove: () => void
}

function AssetUploader({
  label,
  hint,
  accept = "image/png,image/jpeg,image/webp",
  previewUrl,
  previewBackground = "#ffffff",
  uploading,
  inputRef,
  onChoose,
  onRemove,
}: AssetUploaderProps) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative mt-1.5">
        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 text-xs text-gray-500 transition-colors hover:border-[var(--color-pmb-cyan)] hover:bg-[var(--color-pmb-lime-50)]/50">
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processando...</span>
            </>
          ) : previewUrl ? (
            <div
              className="relative flex h-full w-full items-center justify-center"
              style={{ backgroundColor: previewBackground }}
            >
              <Image
                src={previewUrl}
                alt={label}
                fill
                className="object-contain p-2"
                unoptimized
              />
            </div>
          ) : (
            <>
              <Upload className="h-5 w-5" />
              <span>{hint}</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              onChoose(file)
              if (e.target) e.target.value = ""
            }}
          />
        </label>
        {previewUrl && !uploading && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover ${label.toLowerCase()}`}
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {previewUrl && !uploading && (
        <p className="mt-1 text-[11px] text-gray-500">
          Clique na imagem para trocar, ou no <Trash2 className="inline h-3 w-3 align-middle" /> para remover.
        </p>
      )}
    </div>
  )
}

interface SideOptionProps {
  label: string
  active: boolean
  onClick: () => void
}

function SideOption({ label, active, onClick }: SideOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/60 text-[var(--color-pmb-green-900)]"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
      }`}
    >
      {label}
    </button>
  )
}

interface ColorFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

function ColorField({ id, label, value, onChange }: ColorFieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
        />
        <span className="font-mono text-xs font-semibold text-[var(--color-pmb-green-900)]">
          {value.toUpperCase()}
        </span>
      </div>
    </div>
  )
}

interface ThemeBlockProps {
  title: string
  description: string
  /** Nada foi trocado neste bloco. */
  auto: boolean
  autoLabel?: string
  children: React.ReactNode
}

// <details> nativo: abre e fecha sem estado, funciona por teclado e continua
// consultável em modo somente leitura (fieldset disabled não o trava).
function ThemeBlock({
  title,
  description,
  auto,
  autoLabel = "Automático",
  children,
}: ThemeBlockProps) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-gray-50/50 open:bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {title}
          </span>
          <span className="block text-xs text-gray-600">{description}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            auto
              ? "bg-gray-100 text-gray-600"
              : "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
          }`}
        >
          {auto ? autoLabel : "Personalizado"}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-4 border-t border-gray-200 px-4 py-4">{children}</div>
    </details>
  )
}

function ButtonGroup({
  title,
  example,
  children,
}: {
  title: string
  example: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--color-pmb-green-900)]">
        {title} <span className="font-normal text-gray-500">({example})</span>
      </p>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

interface AutoColorFieldProps {
  id: string
  label: string
  /** Cor escolhida à mão, ou `null` = automático. */
  value: string | null
  /** A cor que o automático está usando agora (mostrada enquanto `value` é nulo). */
  auto: string
  onChange: (value: string | null) => void
}

function AutoColorField({ id, label, value, auto, onChange }: AutoColorFieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
        <input
          id={id}
          type="color"
          value={value ?? auto}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
        />
        {value === null ? (
          <span className="text-xs text-gray-600">Automático</span>
        ) : (
          <>
            <span className="font-mono text-xs font-semibold text-[var(--color-pmb-green-900)]">
              {value.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-auto text-[11px] font-semibold text-gray-600 underline underline-offset-2"
            >
              Voltar ao automático
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ToneField({
  label,
  value,
  onChange,
}: {
  label: string
  value: Tone
  onChange: (value: Tone) => void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <SideOption label="Claro" active={value === "light"} onClick={() => onChange("light")} />
        <SideOption label="Escuro" active={value === "dark"} onClick={() => onChange("dark")} />
      </div>
    </div>
  )
}
