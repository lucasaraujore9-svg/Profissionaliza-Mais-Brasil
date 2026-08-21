import { Scale } from "lucide-react"

/**
 * Nota legal sobre a regulamentacao dos cursos livres (Lei nº 9.394/96 +
 * Decreto nº 5.154/2004), exibida no catalogo e na pagina do curso.
 *
 * O texto e juridico e foi definido pelo dono — nao reescrever/resumir.
 *
 * `brandName` existe porque o MESMO bloco e servido na vitrine da PMB e na de
 * cada unidade: sem ele, a vitrine de uma revenda anunciaria a marca
 * "Profissionaliza" no lugar da propria (mesma classe de vazamento de marca ja
 * tratada em layouts, e-mails e metadata tenant-aware).
 */
export function RegulamentacaoNote({
  brandName,
  className = "",
}: {
  /** Nome da unidade quando em vitrine de revenda. Ausente = marca PMB. */
  brandName?: string | null
  className?: string
}) {
  const marca = brandName?.trim()
  const ofertante = marca ? `por ${marca}` : "pela Profissionaliza"

  return (
    <section
      aria-label="Regulamentação dos cursos"
      className={`rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white p-5 md:p-6 ${className}`}
    >
      <h2 className="flex items-center gap-2.5 text-[15px] font-black text-[var(--color-pmb-green)]">
        <Scale
          className="h-4 w-4 shrink-0 text-[var(--color-pmb-gold-600)]"
          aria-hidden
        />
        Regulamentação dos cursos
      </h2>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[rgba(2,89,24,0.75)]">
        Os cursos oferecidos {ofertante} são cursos livres, regulamentados pela
        Lei nº 9.394/96 e pelo Decreto nº 5.154/2004. Por serem de livre oferta,
        não exigem credenciamento no MEC. Estes cursos são destinados ao
        aperfeiçoamento profissional, não conferindo grau acadêmico ou técnico,
        nem substituindo formações exigidas por legislações específicas. A
        aceitação do certificado depende exclusivamente dos critérios da empresa
        ou instituição que o aluno deseja apresentar.
      </p>
    </section>
  )
}
