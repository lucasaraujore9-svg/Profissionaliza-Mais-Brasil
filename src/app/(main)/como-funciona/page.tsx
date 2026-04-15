import Link from "next/link"
import { ShoppingCart, PlayCircle, Award, LifeBuoy } from "lucide-react"
import { PageHero, PageBody } from "@/components/main/static/page-hero"

const PASSOS = [
  {
    icon: ShoppingCart,
    titulo: "Escolha seu curso",
    texto: "Navegue pelo catálogo, escolha o curso que quer aprender e finalize a compra em poucos minutos. Pagamento seguro via Pix, cartão ou boleto.",
  },
  {
    icon: PlayCircle,
    titulo: "Acesse as aulas",
    texto: "Receba por email os dados de acesso à plataforma de estudos. Assista às aulas quando e onde quiser, no celular, tablet ou computador.",
  },
  {
    icon: Award,
    titulo: "Conclua e certifique-se",
    texto: "Ao concluir os módulos, emita seu certificado reconhecido com validação em todo o território nacional. Pronto para usar em entrevistas e redes sociais.",
  },
  {
    icon: LifeBuoy,
    titulo: "Suporte sempre que precisar",
    texto: "Ficou com dúvida? Fale com nosso time pelo WhatsApp ou email. Atendimento de segunda a sábado, 8h às 20h.",
  },
]

export const metadata = {
  title: "Como funciona — Profissionaliza Mais Brasil",
  description: "Descubra em 4 passos como estudar e emitir seu certificado.",
}

export default function ComoFuncionaPage() {
  return (
    <>
      <PageHero
        eyebrow="Como funciona"
        titulo="Aprenda uma profissão em 4 passos"
        subtitulo="Do momento da compra até emitir seu certificado. Sem complicação, sem mensalidade, sem pegadinha."
      />
      <PageBody>
        <ol className="grid gap-4 md:grid-cols-2">
          {PASSOS.map((p, i) => (
            <li
              key={p.titulo}
              className="relative rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6"
            >
              <span className="absolute right-6 top-6 text-[44px] font-black leading-none text-[var(--color-pmb-mist)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p.icon className="h-9 w-9 text-[var(--color-pmb-gold-600)]" strokeWidth={2} aria-hidden />
              <h3 className="mt-4 text-[18px] font-black text-[var(--color-pmb-green)]">{p.titulo}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[rgba(2,89,24,0.75)]">{p.texto}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl bg-[var(--color-pmb-green)] p-8 text-center text-white">
          <h3 className="text-[22px] font-black">Pronto para começar?</h3>
          <p className="max-w-xl text-[14px] text-white/80">
            Escolha seu curso e dê o primeiro passo para uma nova profissão hoje mesmo.
          </p>
          <Link
            href="/cursos"
            className="mt-2 rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)]"
          >
            Ver todos os cursos
          </Link>
        </div>
      </PageBody>
    </>
  )
}
