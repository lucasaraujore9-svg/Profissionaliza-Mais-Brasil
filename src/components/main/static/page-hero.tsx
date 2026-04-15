interface PageHeroProps {
  eyebrow: string
  titulo: string
  subtitulo?: string
}

export function PageHero({ eyebrow, titulo, subtitulo }: PageHeroProps) {
  return (
    <section className="bg-[var(--color-pmb-green)] text-white">
      <div className="mx-auto max-w-[1080px] px-4 py-12 md:px-6 md:py-16">
        <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-[30px] font-black leading-tight md:text-[42px]">{titulo}</h1>
        {subtitulo && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/80">{subtitulo}</p>
        )}
      </div>
    </section>
  )
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-[var(--color-pmb-mist)]">
      <div className="mx-auto max-w-[1080px] px-4 py-10 md:px-6 md:py-14">{children}</div>
    </section>
  )
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose-pmb rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6 md:p-10 [&_h2]:mt-8 [&_h2]:text-[22px] [&_h2]:font-black [&_h2]:text-[var(--color-pmb-green)] [&_h2:first-child]:mt-0 [&_h3]:mt-6 [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-[var(--color-pmb-green)] [&_p]:mt-3 [&_p]:text-[14.5px] [&_p]:leading-relaxed [&_p]:text-[rgba(2,89,24,0.8)] [&_ul]:mt-3 [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-[14.5px] [&_ul]:text-[rgba(2,89,24,0.8)] [&_li]:list-disc [&_a]:text-[var(--color-pmb-gold-600)] [&_a]:underline [&_strong]:text-[var(--color-pmb-green)] [&_strong]:font-bold">
      {children}
    </div>
  )
}
