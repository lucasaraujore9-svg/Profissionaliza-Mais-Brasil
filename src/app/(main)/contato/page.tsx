import { MessageCircle, Mail, MapPin, Clock, Phone } from "lucide-react"
import { PageHero, PageBody } from "@/components/main/static/page-hero"
import { ContactForm } from "@/components/main/contact-form"
import { getSupportContacts } from "@/lib/branding"

export const metadata = {
  title: "Contato — Profissionaliza Mais Brasil",
  description:
    "Tire dúvidas sobre cursos, suporte ou parcerias. Resposta em até 1 dia útil.",
}

export default function ContatoPage() {
  const support = getSupportContacts()

  return (
    <>
      <PageHero
        eyebrow="Contato"
        titulo="Fala com a gente"
        subtitulo="Tem dúvida sobre algum curso? Precisa de suporte? Quer ser revendedor? Estamos aqui para te ajudar."
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <aside className="space-y-4">
            {support.phoneUrl && (
              <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
                {support.isWhatsapp ? (
                  <MessageCircle
                    className="h-8 w-8 text-[var(--color-pmb-gold-600)]"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : (
                  <Phone
                    className="h-8 w-8 text-[var(--color-pmb-gold-600)]"
                    strokeWidth={2}
                    aria-hidden
                  />
                )}
                <h3 className="mt-3 text-[15px] font-black text-[var(--color-pmb-green)]">
                  {support.isWhatsapp ? "WhatsApp" : "Central de atendimento"}
                </h3>
                {support.phoneLabel && (
                  <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.75)]">
                    {support.phoneLabel}
                  </p>
                )}
                <a
                  href={support.phoneUrl}
                  target={support.isWhatsapp ? "_blank" : undefined}
                  rel={support.isWhatsapp ? "noopener noreferrer" : undefined}
                  className="mt-3 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-[13px] font-bold text-white"
                >
                  {support.isWhatsapp
                    ? "Chamar no WhatsApp"
                    : "Ligar agora"}
                </a>
              </div>
            )}

            <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
              <Mail
                className="h-8 w-8 text-[var(--color-pmb-gold-600)]"
                strokeWidth={2}
                aria-hidden
              />
              <h3 className="mt-3 text-[15px] font-black text-[var(--color-pmb-green)]">
                E-mail
              </h3>
              <p className="mt-1 break-all text-[14px] text-[rgba(2,89,24,0.75)]">
                {support.email}
              </p>
            </div>

            <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
              <Clock
                className="h-8 w-8 text-[var(--color-pmb-gold-600)]"
                strokeWidth={2}
                aria-hidden
              />
              <h3 className="mt-3 text-[15px] font-black text-[var(--color-pmb-green)]">
                Horário
              </h3>
              <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.75)]">
                {support.hours}
              </p>
            </div>

            <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
              <MapPin
                className="h-8 w-8 text-[var(--color-pmb-gold-600)]"
                strokeWidth={2}
                aria-hidden
              />
              <h3 className="mt-3 text-[15px] font-black text-[var(--color-pmb-green)]">
                Onde estamos
              </h3>
              <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.75)]">
                Atendimento 100% online em todo o Brasil
              </p>
            </div>
          </aside>

          <ContactForm />
        </div>
      </PageBody>
    </>
  )
}
