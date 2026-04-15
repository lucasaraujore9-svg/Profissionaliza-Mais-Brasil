import { MessageCircle, Mail, MapPin, Clock } from "lucide-react"
import { PageHero, PageBody } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Contato — Profissionaliza Mais Brasil",
  description: "Fale com a gente por WhatsApp, email ou o formulário abaixo.",
}

export default function ContatoPage() {
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
            <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
              <MessageCircle className="h-8 w-8 text-[var(--color-pmb-gold-600)]" strokeWidth={2} aria-hidden />
              <h3 className="mt-3 text-[15px] font-black text-[var(--color-pmb-green)]">WhatsApp</h3>
              <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.75)]">(11) 4000-0000</p>
              <a
                href="https://wa.me/551140000000"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-[13px] font-bold text-white"
              >
                Chamar no WhatsApp
              </a>
            </div>

            <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
              <Mail className="h-8 w-8 text-[var(--color-pmb-gold-600)]" strokeWidth={2} aria-hidden />
              <h3 className="mt-3 text-[15px] font-black text-[var(--color-pmb-green)]">Email</h3>
              <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.75)]">
                atendimento@profissionalizamaisbrasil.com.br
              </p>
            </div>

            <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
              <Clock className="h-8 w-8 text-[var(--color-pmb-gold-600)]" strokeWidth={2} aria-hidden />
              <h3 className="mt-3 text-[15px] font-black text-[var(--color-pmb-green)]">Horário</h3>
              <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.75)]">
                Segunda a sábado, 8h às 20h
              </p>
            </div>

            <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
              <MapPin className="h-8 w-8 text-[var(--color-pmb-gold-600)]" strokeWidth={2} aria-hidden />
              <h3 className="mt-3 text-[15px] font-black text-[var(--color-pmb-green)]">Onde estamos</h3>
              <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.75)]">
                Atendimento 100% online em todo o Brasil
              </p>
            </div>
          </aside>

          <form
            action="/api/leads"
            method="post"
            className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6 md:p-8"
          >
            <h2 className="text-[20px] font-black text-[var(--color-pmb-green)]">
              Envie sua mensagem
            </h2>
            <p className="mt-1 text-[13.5px] text-[rgba(2,89,24,0.7)]">
              Preencha o formulário e retornamos em até 1 dia útil.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="text-[12.5px] font-bold text-[var(--color-pmb-green)]">Nome completo</span>
                <input
                  name="nome"
                  required
                  className="mt-1.5 w-full rounded-lg border border-[rgba(2,89,24,0.15)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-pmb-green)] outline-none focus:border-[var(--color-pmb-green)]"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[12.5px] font-bold text-[var(--color-pmb-green)]">Email</span>
                  <input
                    name="email"
                    type="email"
                    required
                    className="mt-1.5 w-full rounded-lg border border-[rgba(2,89,24,0.15)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-pmb-green)] outline-none focus:border-[var(--color-pmb-green)]"
                  />
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-bold text-[var(--color-pmb-green)]">WhatsApp</span>
                  <input
                    name="telefone"
                    placeholder="(00) 00000-0000"
                    className="mt-1.5 w-full rounded-lg border border-[rgba(2,89,24,0.15)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-pmb-green)] outline-none focus:border-[var(--color-pmb-green)]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[12.5px] font-bold text-[var(--color-pmb-green)]">Mensagem</span>
                <textarea
                  name="mensagem"
                  required
                  rows={5}
                  className="mt-1.5 w-full rounded-lg border border-[rgba(2,89,24,0.15)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-pmb-green)] outline-none focus:border-[var(--color-pmb-green)]"
                />
              </label>

              <button
                type="submit"
                className="mt-2 rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)] transition-colors hover:brightness-105"
              >
                Enviar mensagem
              </button>
            </div>
          </form>
        </div>
      </PageBody>
    </>
  )
}
