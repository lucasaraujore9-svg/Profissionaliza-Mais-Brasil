// Renderiza um ou mais blocos JSON-LD (schema.org) como <script>.
// Server component — o conteúdo é serializado no HTML inicial, garantindo que
// buscadores e motores generativos leiam os dados sem executar JS.

type JsonLdData = Record<string, unknown>

export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  const blocks = Array.isArray(data) ? data : [data]
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Conteúdo é gerado no servidor a partir de dados próprios (sem input
          // de usuário não sanitizado). Escapamos "<" por segurança.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(block).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  )
}
