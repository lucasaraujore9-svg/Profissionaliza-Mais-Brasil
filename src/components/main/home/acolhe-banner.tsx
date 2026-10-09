export const ACOLHE_URL = "https://acolhemaisbrasil.com.br/"

/**
 * Banner do Acolhe Mais Brasil (atendimento psicológico gratuito para alunos).
 * Renderizado pela seção kind="acolhe" da home — PMB e unidades movem ou
 * desativam como qualquer seção. Mesmo formato do banner EJA:
 * só imagem, clicável, desktop 2048×243 e mobile 1080×1080, até 1600px.
 */
export function AcolheBanner() {
  return (
    <section className="bg-white py-6 md:py-8">
      <div className="mx-auto w-full max-w-[1600px] px-4 md:px-6">
        <a
          href={ACOLHE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full overflow-hidden rounded-2xl transition hover:opacity-95"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/acolhe/banner-mobile.webp"
            alt="Acolhe Mais Brasil — atendimento psicológico gratuito para alunos"
            width={1080}
            height={1080}
            loading="lazy"
            className="block h-auto w-full md:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/acolhe/banner-desktop.webp"
            alt="Acolhe Mais Brasil — atendimento psicológico gratuito para alunos"
            width={2048}
            height={243}
            loading="lazy"
            className="hidden h-auto w-full md:block"
          />
        </a>
      </div>
    </section>
  )
}
