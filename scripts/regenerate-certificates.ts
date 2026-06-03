/**
 * Regenera o PDF de TODOS os certificados ja gerados (pdfUrl != null),
 * aplicando os ajustes mais recentes do layout (variaveis em MAIUSCULO,
 * percentual de conclusao na frente, pagina 2 com fundamentacao legal).
 *
 * Idempotente: generateAndUploadPdf sobrescreve o mesmo objeto no Storage
 * (path por id do certificado) e atualiza pdfUrl + pdfGeneratedAt.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx --env-file=.env.vercel.production scripts/regenerate-certificates.ts   # so conta
 *   npx tsx --env-file=.env.vercel.production scripts/regenerate-certificates.ts              # regenera
 *
 * Por padrao processa TODOS com pdfUrl. Use INCLUDE_REVOKED=0 para pular revogados.
 */
import { prisma } from "@/lib/prisma"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"

const DRY_RUN = process.env.DRY_RUN === "1"
const INCLUDE_REVOKED = process.env.INCLUDE_REVOKED !== "0"
const CONCURRENCY = Number(process.env.REGEN_CONCURRENCY ?? 4)

async function main() {
  const where = {
    pdfUrl: { not: null },
    ...(INCLUDE_REVOKED ? {} : { revokedAt: null }),
  }

  const total = await prisma.certificate.count({ where })
  const revokedWithPdf = await prisma.certificate.count({
    where: { pdfUrl: { not: null }, revokedAt: { not: null } },
  })

  console.log(`Certificados com PDF gerado: ${total}`)
  console.log(`  (revogados com PDF: ${revokedWithPdf} — ${INCLUDE_REVOKED ? "INCLUSOS" : "PULADOS"})`)

  if (DRY_RUN) {
    console.log("DRY_RUN=1 — nada foi alterado.")
    return
  }
  if (total === 0) {
    console.log("Nada a regenerar.")
    return
  }

  const ids = (
    await prisma.certificate.findMany({ where, select: { id: true }, orderBy: { createdAt: "asc" } })
  ).map((c) => c.id)

  let ok = 0
  const failures: { id: string; error: string }[] = []

  // Processa em lotes para nao estourar o pool do Supabase nem o Storage.
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map((id) => generateAndUploadPdf(id)))
    results.forEach((r, j) => {
      if (r.status === "fulfilled") {
        ok++
      } else {
        failures.push({ id: batch[j], error: String(r.reason?.message ?? r.reason) })
      }
    })
    console.log(`Progresso: ${Math.min(i + CONCURRENCY, ids.length)}/${ids.length} (ok=${ok}, falhas=${failures.length})`)
  }

  console.log(`\nConcluido. Regenerados: ${ok}/${ids.length}.`)
  if (failures.length) {
    console.log(`Falhas (${failures.length}):`)
    failures.forEach((f) => console.log(`  - ${f.id}: ${f.error}`))
    process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error("Erro fatal:", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
