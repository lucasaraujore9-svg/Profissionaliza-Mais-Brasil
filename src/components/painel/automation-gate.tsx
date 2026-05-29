import Link from "next/link"
import {
  Zap,
  Lock,
  Check,
  ArrowLeft,
  MessageCircle,
  Phone,
  Mail,
} from "lucide-react"
import { getSupportContacts } from "@/lib/branding"

interface AutomationGateProps {
  /** Quando false, o conteúdo é desfocado e bloqueado por um pop-up comercial. */
  enabled: boolean
  children: React.ReactNode
}

const BENEFITS: { title: string; desc: string }[] = [
  {
    title: "Capte leads na própria página do curso",
    desc: "Um formulário “Quero saber mais” transforma visitantes curiosos em contatos no seu funil — antes que esqueçam de você.",
  },
  {
    title: "WhatsApp no piloto automático",
    desc: "Boas-vindas, recuperação de carrinho abandonado e confirmação de compra disparam sozinhos, na hora certa.",
  },
  {
    title: "CRM visual de vendas (Kanban)",
    desc: "Cada lead na coluna certa — Novo, Em contato, Checkout, Pago — para você nunca mais perder uma oportunidade de vista.",
  },
  {
    title: "Recupere as vendas que você perde hoje",
    desc: "Quem abandona o checkout recebe uma mensagem automática e volta a comprar. Mais faturamento com o mesmo tráfego.",
  },
  {
    title: "Jornada completa de cada lead",
    desc: "Veja os cursos que a pessoa visitou, onde abandonou e o histórico de conversas — e fale a coisa certa na hora certa.",
  },
]

/**
 * Paywall do módulo Automação para o painel do revendedor.
 *
 * Regras de negócio:
 *  - A unidade NUNCA ativa a automação sozinha — só Super Admin ou Gerente de
 *    Revendedores fazem isso (enforce no endpoint admin). Por isso o CTA aponta
 *    para o contato comercial, não para um toggle.
 *  - Quando desabilitada, o menu continua visível; ao entrar, o conteúdo real
 *    aparece desfocado e inerte (não clicável) e este pop-up explica o serviço.
 */
export function AutomationGate({ enabled, children }: AutomationGateProps) {
  if (enabled) return <>{children}</>

  const support = getSupportContacts()
  const contactHref = support.phoneUrl ?? `mailto:${support.email}`
  const isExternal = contactHref.startsWith("http")

  return (
    <div className="relative min-h-[70vh]">
      {/* Conteúdo real — desfocado e inerte (sem cliques nem foco). */}
      <div
        aria-hidden
        inert
        className="pointer-events-none select-none blur-[3px] opacity-40"
      >
        {children}
      </div>

      {/* Camada de bloqueio + pop-up comercial. */}
      <div className="absolute inset-0 z-30 overflow-y-auto bg-[var(--color-pmb-mist)]/50 backdrop-blur-[2px]">
        <div className="flex min-h-full items-start justify-center px-4 py-6 sm:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--color-pmb-green)]/15 bg-white shadow-2xl">
          <div className="bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)] px-6 py-5 text-white">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
              <Lock className="h-3 w-3" /> Recurso Premium
            </span>
            <h2 className="mt-3 flex items-center gap-2 font-display text-xl font-extrabold leading-tight">
              <Zap className="h-5 w-5 shrink-0 text-[var(--color-pmb-lime)]" />
              Venda no automático com a Automação PMB
            </h2>
            <p className="mt-1.5 text-[13px] leading-snug text-white/85">
              Cada visitante que sai sem comprar é dinheiro deixado na mesa. A
              Automação captura, conversa e recupera vendas por você — 24 horas
              por dia.
            </p>
          </div>

          <div className="space-y-3 px-6 py-5">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[13px] font-bold text-[var(--color-pmb-green-900)]">
                    {b.title}
                  </p>
                  <p className="text-[12px] leading-snug text-gray-600">
                    {b.desc}
                  </p>
                </div>
              </div>
            ))}

            <div className="rounded-xl bg-[var(--color-pmb-mist)]/60 px-4 py-3 text-center">
              <p className="text-[13px] font-semibold text-[var(--color-pmb-green-900)]">
                Quem ativa a Automação vende mais com o mesmo número de visitas.
              </p>
              <p className="text-[12px] text-gray-600">
                É o vendedor que nunca dorme — e nunca esquece de um cliente.
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 px-6 py-5">
            <p className="text-center text-[12px] text-gray-500">
              A ativação é feita pela equipe Profissionaliza Mais Brasil. Fale
              com seu gerente de conta:
            </p>
            <a
              href={contactHref}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-pmb-green)] px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
            >
              <Zap className="h-4 w-4" />
              Quero ativar a Automação
            </a>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-gray-600">
              {support.phoneLabel && (
                <span className="inline-flex items-center gap-1.5">
                  {support.isWhatsapp ? (
                    <MessageCircle className="h-3.5 w-3.5 text-[var(--color-pmb-green)]" />
                  ) : (
                    <Phone className="h-3.5 w-3.5 text-[var(--color-pmb-green)]" />
                  )}
                  {support.phoneLabel}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[var(--color-pmb-green)]" />
                {support.email}
              </span>
            </div>

            <Link
              href="/painel"
              className="mt-4 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-gray-500 hover:text-[var(--color-pmb-green)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao painel
            </Link>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
