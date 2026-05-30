/**
 * Layout das landings de captação (ex: /seja-revendedor).
 *
 * Diferente do site institucional (route group `(main)`), aqui NÃO renderizamos
 * a navbar (com a logo do Profissionaliza) nem o rodapé com os links do sistema
 * mãe (cursos, CNPJ, institucional). É uma landing page independente, focada em
 * conversão — a própria página traz hero, CTAs e formulário.
 */
export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <main className="flex-1">{children}</main>
}
