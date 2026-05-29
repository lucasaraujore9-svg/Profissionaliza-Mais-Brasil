import Link from "next/link"
import { PageHero, PageBody } from "@/components/main/static/page-hero"
import { getSupportContacts } from "@/lib/branding"
import { JsonLd } from "@/components/seo/json-ld"
import { faqJsonLd } from "@/lib/seo/jsonld"

const FAQ = [
  {
    p: "Como faço para acessar meu curso depois da compra?",
    r: "Assim que o pagamento for confirmado, enviamos um email com seus dados de acesso à plataforma de estudos. Se não receber em até 30 minutos, cheque a caixa de spam ou fale conosco no WhatsApp.",
  },
  {
    p: "O certificado é reconhecido?",
    r: "Sim. Emitimos certificado de curso livre com validação nacional, aceito em seleções e currículos. O documento inclui carga horária e assinatura digital.",
  },
  {
    p: "Por quanto tempo posso assistir às aulas?",
    r: "Acesso ininterrupto enquanto o curso estiver disponível na plataforma — estude no seu ritmo, sem prazo determinado.",
  },
  {
    p: "Posso assistir pelo celular?",
    r: "Pode sim. A plataforma é responsiva e funciona em qualquer navegador de celular, tablet ou computador.",
  },
  {
    p: "Quais as formas de pagamento?",
    r: "Pix (com desconto), cartão de crédito em até 12x sem juros ou boleto bancário. O processamento é de forma segura.",
  },
  {
    p: "E se eu não gostar do curso?",
    r: "Você tem 7 dias corridos a partir da compra para solicitar reembolso integral. Basta falar com nosso atendimento — sem burocracia.",
  },
  {
    p: "Preciso de conhecimento prévio?",
    r: "Não. Nossos cursos são pensados para quem está começando do zero. Vamos te guiar desde o básico até o nível avançado.",
  },
  {
    p: "Quero ser revendedor. Como funciona?",
    r: "Você monta sua própria vitrine, escolhe os cursos que quer vender e ganha comissão em cada venda. Visite nossa página de revendedor para saber mais.",
  },
]

export const metadata = {
  title: "Central de Ajuda — Profissionaliza Mais Brasil",
  description: "Dúvidas frequentes sobre cursos, pagamentos, certificados e acesso.",
  alternates: { canonical: "/ajuda" },
}

export default function AjudaPage() {
  const support = getSupportContacts()

  return (
    <>
      <JsonLd
        data={faqJsonLd(FAQ.map((item) => ({ question: item.p, answer: item.r })))}
      />
      <PageHero
        eyebrow="Central de ajuda"
        titulo="Dúvidas frequentes"
        subtitulo="Encontre respostas rápidas para as perguntas mais comuns. Se precisar, nosso time está a um clique de distância."
      />
      <PageBody>
        <ul className="space-y-3">
          {FAQ.map((item) => (
            <li
              key={item.p}
              className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5"
            >
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-bold text-[var(--color-pmb-green)]">
                  {item.p}
                  <span className="ml-4 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-pmb-mist)] text-[var(--color-pmb-gold-600)] transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[14px] leading-relaxed text-[rgba(2,89,24,0.78)]">{item.r}</p>
              </details>
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6 text-center">
          <h3 className="text-[18px] font-black text-[var(--color-pmb-green)]">Não achou sua dúvida?</h3>
          <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.7)]">
            {support.phoneLabel && support.phoneUrl ? (
              <>
                {support.isWhatsapp ? "Chama a gente no WhatsApp" : "Ligue para a nossa central"}:{" "}
                <a
                  href={support.phoneUrl}
                  target={support.isWhatsapp ? "_blank" : undefined}
                  rel={support.isWhatsapp ? "noopener noreferrer" : undefined}
                  className="font-bold underline"
                >
                  {support.phoneLabel}
                </a>
              </>
            ) : (
              "Fala com a gente — respondemos em até 1 dia útil."
            )}
          </p>
          <Link
            href="/contato"
            className="mt-4 inline-block rounded-lg bg-[var(--color-pmb-gold)] px-5 py-2.5 text-[13px] font-bold text-[var(--color-pmb-green)]"
          >
            Falar com atendimento
          </Link>
        </div>
      </PageBody>
    </>
  )
}
