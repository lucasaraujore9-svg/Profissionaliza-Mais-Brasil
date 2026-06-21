import Image from "next/image"
import Link from "next/link"
import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  Globe,
  Headset,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Users,
  X,
} from "lucide-react"
import { PreLiveVideo } from "@/components/main/pre-live-video"
import { LandingAnimations } from "@/components/main/anim/landing-animations"

// Pagina "pre-live" / pos-cadastro: destino para quem envia QUALQUER um dos
// formularios de captacao de revendedor (/seja-revendedor, /lp-revenda2 e a home
// de livrecursos.com.br). Vive sob /seja-revendedor/* de proposito: esse prefixo
// e servido direto nos DOIS dominios (PMB e livrecursos) — ver o passthrough em
// src/proxy.ts (VITRINE_APEX_PASSTHROUGH) —, entao um unico redirect relativo
// (`/seja-revendedor/pre-live`) funciona em todas as origens.
//
// Fluxo: confirmacao + video vertical (VSL) -> comparacao de preco -> "sua
// melhor opcao" -> quem esta por tras (Grupo BMB + Leonardo) -> proximos passos.
// No mobile, o video vem ACIMA do texto do hero (ordem invertida).

export const metadata = {
  title: "Cadastro recebido | Profissionaliza Mais Brasil",
  description:
    "Recebemos o seu cadastro. Aperte o play e veja como ter a sua própria escola de cursos profissionalizantes. Em até 1 dia útil a gente te chama no WhatsApp.",
  // Pagina de obrigado/pre-live: nao deve ser indexada.
  robots: { index: false, follow: false },
}

// CTA opcional de WhatsApp. So aparece se a env publica estiver configurada —
// nao ha numero global de atendimento no codigo, entao nao inventamos um.
const WHATSAPP_URL = process.env.NEXT_PUBLIC_PMB_WHATSAPP_URL

const TRUST = [
  { icon: Globe, label: "Um site com a sua marca" },
  { icon: Sparkles, label: "Mais de 200 cursos prontos" },
  { icon: ShieldCheck, label: "Você não paga comissão" },
] as const

const ALTERNATIVAS = [
  {
    titulo: "Abrir uma escola física",
    descricao:
      "Aluguel, reforma, funcionários e uns bons meses no prejuízo antes da primeira matrícula.",
    faixa: "R$ 50 mil a R$ 200 mil",
  },
  {
    titulo: "Montar a sua própria plataforma",
    descricao:
      "Anos mexendo com tecnologia, gravando curso por curso e bancando o suporte sozinho.",
    faixa: "R$ 20 mil a R$ 100 mil",
  },
  {
    titulo: "Comprar um curso de “como empreender”",
    descricao:
      "Você sai cheio de teoria e sem nenhum produto pra vender no dia seguinte.",
    faixa: "R$ 500 a R$ 5 mil",
  },
] as const

const PLANOS = [
  {
    titulo: "Profissionaliza",
    preco: "R$ 209",
    periodo: "/mês",
    descricao: "Sua escola no ar: site próprio e 200 cursos, sem comissão.",
    destaque: false,
  },
  {
    titulo: "Profissionaliza PRO",
    preco: "R$ 239",
    periodo: "/mês",
    descricao:
      "Tudo do Profissionaliza mais a Automação, que vende no WhatsApp por você.",
    destaque: true,
  },
] as const

const GRUPO_STATS = [
  { icon: Users, valor: "+1,5 milhão", label: "de alunos impactados" },
  { icon: Store, valor: "+1.500", label: "unidades parceiras" },
  { icon: Star, valor: "Nota máxima", label: "no Reclame Aqui" },
] as const

const PASSOS = [
  {
    quando: "Agora",
    titulo: "Recebemos o seu cadastro",
    descricao: "Os seus dados já chegaram pro nosso time de vendas.",
    icon: BadgeCheck,
  },
  {
    quando: "Em até 1 dia útil",
    titulo: "A gente te chama no WhatsApp",
    descricao: "Pra tirar as suas dúvidas e escolher com você o melhor plano.",
    icon: Headset,
  },
  {
    quando: "Sua escola no ar",
    titulo: "Você começa a vender",
    descricao:
      "É só ajustar a sua vitrine, ligar o pagamento e publicar os 200 cursos.",
    icon: Sparkles,
  },
] as const

export default function PreLiveRevendedorPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#02140a] text-white">
      <LandingAnimations />

      {/* Camadas de fundo: glows + grão + vinheta */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 18% -5%, rgba(192,217,4,0.22) 0%, transparent 60%), radial-gradient(55% 45% at 88% 5%, rgba(242,183,5,0.20) 0%, transparent 58%), radial-gradient(70% 60% at 50% 120%, rgba(1,46,11,0.9) 0%, transparent 65%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      {/* Barra de topo */}
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-7 md:px-8">
        <Image
          src="/images/logo-pmb-branco.png"
          alt="Profissionaliza Mais Brasil"
          width={380}
          height={200}
          priority
          className="h-auto w-[124px] shrink-0 sm:w-[150px]"
        />
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Cadastro confirmado
        </span>
      </div>

      {/* HERO */}
      <header className="relative mx-auto max-w-6xl overflow-x-clip px-4 pb-4 pt-10 md:px-8 md:pt-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* Texto — no mobile vem DEPOIS do video */}
          <div className="order-2 text-center lg:order-1 lg:text-left" data-reveal>
            <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-yellow-300/90">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-300/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-300" />
              </span>
              Você deu o primeiro passo
            </p>

            <h1 className="mt-5 text-[2rem] font-black leading-[1.05] tracking-tight break-words md:text-[3.3rem]">
              Bem-vindo! Agora deixa a gente te mostrar a{" "}
              <span className="bg-gradient-to-r from-[var(--color-pmb-gold)] via-[#FFE08A] to-[var(--color-pmb-lime)] bg-clip-text text-transparent">
                sua nova escola
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base text-white/75 md:mx-0 md:text-lg">
              Aperte o play e assista até o final. Em poucos minutos você entende
              como funciona: mais de{" "}
              <strong className="font-semibold text-white">
                200 cursos prontos
              </strong>
              , um site com a sua marca e nenhuma comissão sobre o que você
              vender. Em até 1 dia útil a gente te chama no WhatsApp.
            </p>

            <ul
              className="mt-9 flex flex-wrap justify-center gap-2.5 lg:justify-start"
              data-stagger
            >
              {TRUST.map((t) => (
                <li
                  key={t.label}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm text-white/85 backdrop-blur-sm"
                >
                  <t.icon className="h-4 w-4 shrink-0 text-[var(--color-pmb-lime)]" />
                  {t.label}
                </li>
              ))}
            </ul>

            <p className="mt-8 inline-flex items-center gap-2 text-sm text-white/55">
              <Clock className="h-4 w-4 shrink-0 text-yellow-300/80" />
              Assiste com calma. A gente já está preparando o seu atendimento.
            </p>
          </div>

          {/* Video vertical (autoplay + mini-player no scroll). No mobile vem
              ANTES do texto. A moldura premium vive dentro do componente. */}
          <div className="relative order-1 mx-auto w-full max-w-[280px] sm:max-w-[330px] lg:order-2">
            <PreLiveVideo src="/videos/prelive-revenda.mp4" />
          </div>
        </div>
      </header>

      {/* Comparacao de preco */}
      <section className="relative mx-auto mt-24 max-w-5xl px-4 md:mt-36 md:px-8">
        <div className="text-center" data-reveal>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-yellow-300/90">
            Antes de decidir, compara
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-[1.7rem] font-black leading-tight tracking-tight md:text-[2.5rem]">
            Quanto custa montar um negócio de educação?
          </h2>
        </div>

        <div
          className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3"
          data-stagger
          data-stagger-step="0.1"
        >
          {ALTERNATIVAS.map((alt) => (
            <div
              key={alt.titulo}
              className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors hover:border-white/15"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-300/90 ring-1 ring-rose-400/20">
                <X className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-white/90">
                {alt.titulo}
              </h3>
              <p className="mt-2 flex-1 text-sm text-white/55">
                {alt.descricao}
              </p>
              <p className="mt-5 text-xl font-black text-white/70 line-through decoration-rose-400/50 decoration-2">
                {alt.faixa}
              </p>
            </div>
          ))}
        </div>

        {/* Sua melhor opcao */}
        <div className="relative mt-7" data-reveal>
          <div
            aria-hidden
            className="absolute -inset-1 -z-10 rounded-[2rem] opacity-60 blur-2xl"
            style={{
              backgroundImage:
                "linear-gradient(110deg, rgba(242,183,5,0.45), rgba(192,217,4,0.4))",
            }}
          />
          <div className="overflow-hidden rounded-[1.9rem] bg-gradient-to-br from-white to-[#f6fbe9] text-[var(--color-pmb-green-900)] shadow-2xl ring-1 ring-white/40">
            <div className="flex items-center justify-center gap-2 bg-[var(--color-pmb-green)] px-6 py-3 text-center">
              <Sparkles className="h-4 w-4 shrink-0 text-yellow-300" />
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-yellow-300">
                O jeito mais fácil de começar
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 p-7 md:grid-cols-[1.1fr_1fr] md:items-center md:p-10">
              <div>
                <h3 className="text-2xl font-black leading-tight tracking-tight md:text-[1.9rem]">
                  Ser revendedor Profissionaliza Mais Brasil
                </h3>
                <p className="mt-3 text-sm text-gray-600 md:text-base">
                  Você recebe mais de 200 cursos prontos, um site com a sua marca
                  e o pagamento já integrado. Não precisa gravar aula, não precisa
                  de loja física e não paga comissão. Em poucos dias você já está
                  vendendo.
                </p>

                {WHATSAPP_URL ? (
                  <Link
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-7 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-pmb-green)] px-6 text-base font-bold text-white shadow-lg shadow-[var(--color-pmb-green)]/20 transition-transform hover:scale-[1.02] hover:bg-[var(--color-pmb-green-700)] sm:w-auto"
                  >
                    <MessageCircle className="h-5 w-5" />
                    Falar agora no WhatsApp
                  </Link>
                ) : (
                  <p className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[var(--color-pmb-lime-50)] px-5 py-3 text-sm font-semibold text-[var(--color-pmb-green-900)] ring-1 ring-[var(--color-pmb-lime-200)]">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--color-pmb-green)]" />
                    O seu cadastro já está na fila do nosso time
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {PLANOS.map((plano) => (
                  <div
                    key={plano.titulo}
                    className={`rounded-2xl border p-5 ${
                      plano.destaque
                        ? "border-[var(--color-pmb-green)]/30 bg-[var(--color-pmb-lime-50)] shadow-sm"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2 text-base font-bold text-[var(--color-pmb-green-900)]">
                        {plano.titulo}
                        {plano.destaque && (
                          <span className="rounded-full bg-[var(--color-pmb-gold)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--color-pmb-green-900)]">
                            Popular
                          </span>
                        )}
                      </span>
                      <span className="whitespace-nowrap text-xl font-black text-[var(--color-pmb-green)]">
                        {plano.preco}
                        <span className="text-sm font-bold text-[var(--color-pmb-green)]/70">
                          {plano.periodo}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {plano.descricao}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quem esta por tras: Grupo Bolsa Mais Brasil + Leonardo Vaisman */}
      <section className="relative mx-auto mt-24 max-w-4xl px-4 md:mt-36 md:px-8">
        <div className="text-center" data-reveal>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-yellow-300/90">
            Quem está por trás disso
          </p>
          <h2 className="mt-4 text-[1.7rem] font-black tracking-tight md:text-[2.5rem]">
            Você não vai empreender sozinho
          </h2>
        </div>

        <div
          className="mt-12 overflow-hidden rounded-[1.9rem] border border-white/10 bg-white/[0.03] p-7 backdrop-blur-sm md:p-10"
          data-reveal
        >
          <Image
            src="/images/logo-grupo-bmb.png"
            alt="Grupo Bolsa Mais Brasil"
            width={420}
            height={236}
            className="mx-auto h-auto w-[170px] opacity-90"
          />

          <p className="mx-auto mt-7 max-w-2xl text-center text-base text-white/75">
            A Profissionaliza Mais Brasil faz parte do Grupo Bolsa Mais Brasil,
            um dos maiores ecossistemas de educação do país. É gente de verdade
            ajudando gente de verdade a estudar e a empreender.
          </p>

          <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-3" data-stagger>
            {GRUPO_STATS.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5"
              >
                <s.icon className="h-5 w-5 shrink-0 text-[var(--color-pmb-lime)]" />
                <span>
                  <span className="block text-base font-black leading-tight">
                    {s.valor}
                  </span>
                  <span className="block text-xs text-white/55">{s.label}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-9 border-t border-white/10 pt-8 md:flex md:items-start md:gap-5">
            <span className="mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-pmb-gold)] to-[#FFD96B] text-xl font-black text-[var(--color-pmb-green-900)] md:mx-0">
              LV
            </span>
            <div className="mt-4 text-center md:mt-0 md:text-left">
              <p className="text-lg font-bold">Leonardo Vaisman</p>
              <p className="text-sm text-yellow-300/90">
                Idealizador e CEO do grupo
              </p>
              <p className="mt-3 text-sm text-white/70">
                Quem aparece falando no vídeo é o Leonardo. Ele morou na rua, foi
                camelô no Rio de Janeiro e construiu tudo isso acreditando numa
                coisa só: educação muda vida. É essa história que está por trás
                da sua nova escola.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Proximos passos */}
      <section className="relative mx-auto mt-24 max-w-3xl px-4 pb-16 md:mt-36 md:px-8 md:pb-24">
        <div className="text-center" data-reveal>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-yellow-300/90">
            O que acontece agora
          </p>
          <h2 className="mt-4 text-[1.7rem] font-black tracking-tight md:text-[2.5rem]">
            Do cadastro à sua primeira venda
          </h2>
        </div>

        <ol className="relative mt-14 space-y-4" data-stagger data-stagger-step="0.12">
          {/* linha conectora */}
          <span
            aria-hidden
            className="absolute top-4 bottom-4 left-[2.625rem] w-px -translate-x-1/2 bg-gradient-to-b from-[var(--color-pmb-gold)]/60 via-white/15 to-transparent md:left-[2.875rem]"
          />
          {PASSOS.map((passo, i) => (
            <li
              key={passo.titulo}
              className="relative flex gap-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-sm md:gap-6 md:p-6"
            >
              <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-pmb-gold)] to-[#FFD96B] text-base font-black text-[var(--color-pmb-green-900)] shadow-lg shadow-[var(--color-pmb-gold)]/25 ring-4 ring-[#02140a]">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-yellow-300/90">
                  {passo.quando}
                </p>
                <h3 className="mt-1 flex items-center gap-2 text-lg font-bold">
                  <passo.icon className="h-4.5 w-4.5 shrink-0 text-[var(--color-pmb-lime)]" />
                  {passo.titulo}
                </h3>
                <p className="mt-1 text-sm text-white/60">{passo.descricao}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mx-auto mt-12 flex max-w-xl items-center justify-center gap-2 text-center text-sm text-white/55">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-pmb-lime)]" />
          Deixa o WhatsApp e o e-mail por perto. É por ali que a gente vai se
          falar.
        </p>
      </section>

      {/* Rodapé */}
      <footer className="relative border-t border-white/10 py-7 text-center">
        <p className="text-xs text-white/40">
          Profissionaliza Mais Brasil · uma empresa do Grupo Bolsa Mais Brasil
        </p>
      </footer>
    </div>
  )
}
