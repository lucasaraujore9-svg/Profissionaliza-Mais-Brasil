/**
 * Mockup visual de uma escola fake (parceiro) usado no Hero.
 * É um "browser frame" estilizado em HTML/CSS que mostra
 * como o site personalizado de uma Unidade pode parecer.
 */
const cursos = [
  {
    nome: "Pacote Office",
    categoria: "Informática",
    preco: "R$ 499",
    gradient: "from-[#07B2D9] to-[#025918]",
  },
  {
    nome: "Cuidador de Idoso",
    categoria: "Saúde",
    preco: "R$ 497",
    gradient: "from-[#F2B705] to-[#8C3A27]",
  },
  {
    nome: "Eletricista",
    categoria: "Técnico",
    preco: "R$ 697",
    gradient: "from-[#C0D904] to-[#025918]",
  },
]

export function HeroMockup() {
  return (
    <div className="relative">
      {/* Sombra colorida atrás */}
      <div
        aria-hidden
        className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-yellow-300/20 via-[var(--color-pmb-lime)]/15 to-transparent blur-xl"
      />

      <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/15">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="ml-3 flex flex-1 items-center gap-2 rounded-md bg-white px-3 py-1 ring-1 ring-gray-200">
            <svg
              className="h-3 w-3 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="font-mono text-[10px] text-gray-500">
              escolamaria.com.br
            </span>
          </div>
        </div>

        {/* Fake site content */}
        <div className="p-3 sm:p-4 md:p-5">
          {/* Fake nav */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-pmb-green)] text-[10px] font-black text-white">
                EM
              </div>
              <span className="text-xs font-bold tracking-tight text-gray-900">
                Escola Maria
              </span>
            </div>
            <span className="rounded-full bg-[var(--color-pmb-green)]/10 px-2.5 py-0.5 text-[9px] font-medium text-[var(--color-pmb-green-700)]">
              Entrar
            </span>
          </div>

          {/* Fake hero */}
          <div className="mt-4 rounded-xl bg-gradient-to-br from-[var(--color-pmb-green-900)] to-[var(--color-pmb-green)] p-4 text-white md:p-5">
            <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-yellow-300/90">
              Bem-vindo
            </p>
            <p className="mt-1.5 text-base font-black leading-tight md:text-lg">
              Profissionalize-se sem sair de casa
            </p>
            <p className="mt-1 text-[10px] text-white/70">
              Certificado nacional, suporte e acesso contínuo
            </p>
          </div>

          {/* Course cards */}
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
            Cursos em destaque
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
            {cursos.map((curso) => (
              <article
                key={curso.nome}
                className="overflow-hidden rounded-lg ring-1 ring-gray-200"
              >
                <div className={`bg-gradient-to-br ${curso.gradient}`}>
                  {/* pt-% no lugar de so aspect-ratio: garante a altura em
                      engines antigos (iOS Safari ≤14) onde aspect-ratio colapsa
                      sem conteudo em fluxo. */}
                  <div aria-hidden className="pt-[75%]" />
                </div>
                <div className="p-2">
                  <p className="text-[8px] font-medium uppercase tracking-wide text-gray-400">
                    {curso.categoria}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] font-bold text-gray-900">
                    {curso.nome}
                  </p>
                  <p className="mt-1 text-[10px] font-black text-[var(--color-pmb-green)]">
                    {curso.preco}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* Floating badge */}
      <div
        aria-hidden
        className="absolute -bottom-3 -right-3 flex items-center gap-1.5 rounded-full bg-yellow-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-pmb-green-900)] shadow-lg"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-pmb-green)]" />
        Venda ao vivo
      </div>
    </div>
  )
}
