import { UserPen } from "lucide-react"

/**
 * Nota de RESPONSABILIDADE pelo conteudo de curso produzido por uma unidade.
 *
 * O catalogo tem duas origens muito diferentes e o aluno nao tem como
 * distingui-las: curso da PMB (curado pela plataforma) e curso que uma unidade
 * produziu e publicou por conta propria. Quem compra o segundo precisa saber de
 * quem e o conteudo — e de quem NAO e.
 *
 * So aparece quando ha autor: para o catalogo da PMB (que e a esmagadora
 * maioria) o componente nao renderiza nada.
 *
 * Distinto da `RegulamentacaoNote`, que fala da natureza LEGAL do curso livre e
 * vale para todo curso. Esta fala de AUTORIA e vale so para alguns — juntar as
 * duas faria a nota de regulamentacao mudar de texto conforme a origem, e ela e
 * texto juridico fechado.
 *
 * `kind` troca o substantivo e a lista do que esta coberto. E o mesmo texto
 * juridico com o objeto certo: enumerar "aulas, exercicios e avaliacoes" num
 * e-book descreveria um produto que nao e o que a pessoa esta comprando — e uma
 * clausula que descreve outra coisa e uma clausula que nao protege ninguem.
 */
export function AutoriaNote({
  authorName,
  kind = "curso",
  className = "",
}: {
  /** Unidade que produziu o conteudo. Ausente/vazio = curso da PMB, nao renderiza. */
  authorName?: string | null
  kind?: "curso" | "ebook"
  className?: string
}) {
  const autor = authorName?.trim()
  if (!autor) return null

  const ebook = kind === "ebook"
  const esteConteudo = ebook ? "Este e-book" : "Este curso"
  const materiais = ebook
    ? "texto, imagens, ilustrações e demais elementos"
    : "material didático, aulas, textos, imagens, exercícios e avaliações"
  const doConteudo = ebook ? "deste e-book" : "deste curso"

  return (
    <section
      aria-label="Responsabilidade pelo conteúdo"
      className={`rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white p-5 md:p-6 ${className}`}
    >
      <h2 className="flex items-center gap-2.5 text-[15px] font-black text-[var(--color-pmb-green)]">
        <UserPen
          className="h-4 w-4 shrink-0 text-[var(--color-pmb-gold-600)]"
          aria-hidden
        />
        Responsabilidade pelo conteúdo
      </h2>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[rgba(2,89,24,0.75)]">
        {esteConteudo} é produzido e mantido por <strong>{autor}</strong>, unidade
        parceira responsável, de forma integral e exclusiva, por todo o conteúdo
        ofertado — {materiais} —, bem como por sua autoria, originalidade,
        veracidade, atualização e adequação legal, incluindo direitos autorais e
        de imagem de terceiros. A Profissionaliza Mais Brasil, a Livre Cursos e o
        Grupo Bolsa Mais Brasil atuam exclusivamente como plataforma de
        tecnologia, intermediação e distribuição, não produzindo, revisando,
        endossando nem se responsabilizando pelo conteúdo {doConteudo}. Dúvidas,
        reclamações ou solicitações sobre o conteúdo devem ser dirigidas
        diretamente a {autor}.
      </p>
    </section>
  )
}
