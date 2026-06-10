/**
 * Aviso contextual exibido no topo das páginas legais (Termos / Privacidade)
 * QUANDO acessadas a partir da vitrine de um revendedor. O corpo do documento
 * legal já trata o modelo multi-parte ("Unidade" vende, PMB intermedia), mas é
 * escrito na voz institucional do PMB — este bloco reenquadra para a loja em que
 * o visitante está, deixando claro com quem ele contrata e qual o papel do PMB.
 */
export function LegalTenantNotice({
  tenantName,
  kind,
}: {
  tenantName: string
  kind: "termos" | "privacidade"
}) {
  return (
    <div className="mb-6 rounded-xl border border-[var(--color-pmb-gold-600)]/30 bg-[var(--color-pmb-gold)]/10 p-5 md:p-6">
      <p className="text-[13px] font-bold uppercase tracking-wide text-[var(--color-pmb-green)]">
        Você está na loja {tenantName}
      </p>
      {kind === "termos" ? (
        <p className="mt-2 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.85)]">
          Estes Termos regem a sua compra nesta loja. A relação de compra e venda
          do curso ocorre entre você e <strong>{tenantName}</strong>, unidade
          parceira responsável comercialmente por esta vitrine. O{" "}
          <strong>Profissionaliza Mais Brasil (PMB)</strong> atua como
          intermediador tecnológico e operacional da plataforma, e o conteúdo das
          aulas é produzido e hospedado pela plataforma de ensino parceira. Nas
          cláusulas abaixo, sempre que houver referência a <strong>“Unidade”</strong>,
          ela diz respeito a <strong>{tenantName}</strong>.
        </p>
      ) : (
        <p className="mt-2 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.85)]">
          Nas compras realizadas nesta loja, <strong>{tenantName}</strong> é a{" "}
          <strong>Controladora</strong> dos seus dados de cadastro e pagamento, e o{" "}
          <strong>Profissionaliza Mais Brasil (PMB)</strong> atua como{" "}
          <strong>Operador</strong>, tratando os dados conforme esta Política e as
          instruções da loja. Nas cláusulas abaixo, sempre que houver referência a{" "}
          <strong>“Unidade”</strong>, ela diz respeito a <strong>{tenantName}</strong>.
        </p>
      )}
    </div>
  )
}
