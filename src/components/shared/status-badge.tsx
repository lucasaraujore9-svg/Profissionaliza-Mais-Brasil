import { cn } from "@/lib/utils"

/**
 * Tom semantico unico para TODOS os badges de status do app (admin + painel).
 * Mapeia para os tokens de marca PMB — nunca use cores cruas (blue/emerald/violet)
 * em badges de status; escolha o tom certo aqui.
 *
 * success  = ativo / pago / aprovado / conectado   -> verde PMB
 * warning  = pendente / trial / atencao            -> ouro PMB
 * info     = em processamento / manual / neutro+    -> ciano PMB
 * danger   = bloqueado / atrasado / falhou / estorno -> vermelho (rose)
 * neutral  = inativo / cancelado / rascunho         -> cinza
 * accent   = destaque / formado                     -> lima PMB
 */
export type BadgeTone =
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "neutral"
  | "accent"

const TONE_CLASSES: Record<BadgeTone, string> = {
  success:
    "bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green-700)] ring-[var(--color-pmb-green)]/20",
  warning:
    "bg-[var(--color-pmb-gold)]/15 text-[var(--color-pmb-gold-600)] ring-[var(--color-pmb-gold)]/30",
  info: "bg-[var(--color-pmb-cyan-50)] text-[var(--color-pmb-cyan-700)] ring-[var(--color-pmb-cyan)]/25",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
  neutral: "bg-gray-100 text-gray-600 ring-gray-500/20",
  accent:
    "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)] ring-[var(--color-pmb-green)]/15",
}

const DOT_CLASSES: Record<BadgeTone, string> = {
  success: "bg-[var(--color-pmb-green)]",
  warning: "bg-[var(--color-pmb-gold-600)]",
  info: "bg-[var(--color-pmb-cyan)]",
  danger: "bg-rose-500",
  neutral: "bg-gray-400",
  accent: "bg-[var(--color-pmb-lime)]",
}

interface StatusBadgeProps {
  tone?: BadgeTone
  children: React.ReactNode
  /** Mostra o ponto colorido (redundancia para daltonicos). Default: true. */
  dot?: boolean
  className?: string
}

export function StatusBadge({
  tone = "neutral",
  children,
  dot = true,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASSES[tone])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
