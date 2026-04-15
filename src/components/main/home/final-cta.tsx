import Link from "next/link"
import { ArrowRight, ShieldCheck } from "lucide-react"

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-pmb-green)]">
      <div
        aria-hidden
        className="absolute -right-24 -top-24 h-80 w-80 rounded-full"
        style={{ background: "var(--color-pmb-gold)", opacity: 0.18 }}
      />
      <div
        aria-hidden
        className="absolute -left-20 -bottom-20 h-72 w-72 rounded-full"
        style={{ background: "var(--color-pmb-cyan)", opacity: 0.16 }}
      />

      <div className="relative mx-auto max-w-[1280px] px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-pmb-lime)] px-3 py-1 text-[11.5px] font-black uppercase tracking-wider text-[var(--color-pmb-green)]">
            Comece hoje por R$ 47,00
          </span>

          <h2 className="mt-4 text-[30px] font-black leading-[1.05] text-white md:text-[44px]">
            Sua nova profissão<br />
            está a um clique.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/80 md:text-[17px]">
            Escolhe o curso, paga no Pix com 10% de desconto e começa a estudar agora mesmo.
            Se não gostar nos primeiros 7 dias, devolvemos o seu dinheiro.
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/cursos"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-pmb-gold)] px-7 py-3.5 text-[15px] font-black text-[var(--color-pmb-green)] shadow-[0_10px_30px_-10px_rgba(242,183,5,0.6)] transition-transform hover:-translate-y-0.5"
            >
              Ver todos os cursos
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/como-funciona"
              className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3.5 text-[14px] font-bold text-white transition-colors hover:bg-white/10"
            >
              Como funciona
            </Link>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-[12.5px] text-white/70">
            <ShieldCheck className="h-4 w-4 text-[var(--color-pmb-lime)]" strokeWidth={2.25} aria-hidden />
            Compra 100% segura · 7 dias de garantia · Pix, cartão ou boleto
          </div>
        </div>
      </div>
    </section>
  )
}
