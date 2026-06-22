/**
 * Backfill: ressincroniza a senha da plataforma de aulas (EA) dos alunos JA
 * existentes, relendo o valor autoritativo de `usuarios/listar` e regravando
 * `plataformaAlunoSenha` (cifrada). Corrige retratos defasados — ex.: o painel
 * exibia `mrmc3112` enquanto a senha real na EA era `4978048`.
 *
 * A correcao do cadastro futuro vive em `ensureStudentOnPlatform`
 * (resolveAuthoritativePlatformPassword); este script cobre o passado.
 *
 * Requer EA_API_URL + EA_API_TOKEN no ambiente (NAO estao no .env.vercel.production
 * versionado — exporte os valores reais da Vercel antes de rodar).
 *
 * Uso:
 *   # so um aluno (pelo plataformaAlunoId / "usuario" da EA):
 *   STUDENT_IDS=4373 npx tsx --env-file=.env.vercel.production scripts/resync-platform-passwords.ts
 *
 *   # so contar/mostrar divergencias, sem gravar:
 *   DRY_RUN=1 npx tsx --env-file=.env.vercel.production scripts/resync-platform-passwords.ts
 *
 *   # todos os alunos que ja estao na plataforma:
 *   npx tsx --env-file=.env.vercel.production scripts/resync-platform-passwords.ts
 *
 * Idempotente: regrava so quando a senha da EA difere do snapshot local.
 */
import { prisma } from "@/lib/prisma"
import { buscarAluno } from "@/lib/plataforma-cursos/client"
import { encrypt, decrypt } from "@/lib/crypto"

const DRY_RUN = process.env.DRY_RUN === "1"
const CONCURRENCY = Number(process.env.RESYNC_CONCURRENCY ?? 4)
// Lista opcional de plataformaAlunoId (o "usuario" da EA), separada por virgula.
const ONLY_IDS = (process.env.STUDENT_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

type Row = {
  id: string
  nome: string
  plataformaAlunoId: string
  plataformaAlunoSenha: string | null
}

function parseExternalId(value: string | null): number | null {
  if (!value) return null
  if (value.startsWith("pending")) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function localSnapshot(encrypted: string | null): string | null {
  if (!encrypted) return null
  try {
    return decrypt(encrypted)
  } catch {
    // legado em texto puro / corrompido — tratamos como "sem snapshot valido"
    return null
  }
}

async function resyncOne(row: Row): Promise<"updated" | "unchanged" | "skipped" | "failed"> {
  const eaId = parseExternalId(row.plataformaAlunoId)
  if (eaId === null) return "skipped"

  let realSenha: string
  try {
    const aluno = await buscarAluno({ id: eaId })
    realSenha = aluno?.senha != null ? String(aluno.senha).trim() : ""
  } catch (err) {
    console.error(`  [${eaId}] ${row.nome}: falha no usuarios/listar —`, (err as Error).message)
    return "failed"
  }

  if (!realSenha) {
    console.warn(`  [${eaId}] ${row.nome}: EA nao retornou senha — pulado`)
    return "skipped"
  }

  const current = localSnapshot(row.plataformaAlunoSenha)
  if (current === realSenha) return "unchanged"

  console.log(
    `  [${eaId}] ${row.nome}: ${current ?? "(sem snapshot)"} -> ${realSenha}` +
      (DRY_RUN ? "  (dry-run)" : ""),
  )
  if (!DRY_RUN) {
    await prisma.student.update({
      where: { id: row.id },
      data: { plataformaAlunoSenha: encrypt(realSenha) },
    })
  }
  return "updated"
}

async function main() {
  const students = (await prisma.student.findMany({
    where: ONLY_IDS.length
      ? { plataformaAlunoId: { in: ONLY_IDS } }
      : { plataformaAlunoId: { not: { startsWith: "pending" } } },
    select: { id: true, nome: true, plataformaAlunoId: true, plataformaAlunoSenha: true },
  })) as Row[]

  // filtra placeholders "pending_*" que nao tem usuario real na EA
  const targets = students.filter((s) => parseExternalId(s.plataformaAlunoId) !== null)

  console.log(
    `Alunos na plataforma: ${targets.length}` +
      (ONLY_IDS.length ? ` (filtro STUDENT_IDS=${ONLY_IDS.join(",")})` : "") +
      (DRY_RUN ? "  [DRY_RUN]" : ""),
  )
  if (targets.length === 0) {
    console.log("Nada a ressincronizar.")
    return
  }

  const tally = { updated: 0, unchanged: 0, skipped: 0, failed: 0 }
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(resyncOne))
    for (const r of results) tally[r]++
  }

  console.log("\nResumo:")
  console.log(`  atualizados : ${tally.updated}${DRY_RUN ? " (seriam — dry-run)" : ""}`)
  console.log(`  ja corretos : ${tally.unchanged}`)
  console.log(`  pulados     : ${tally.skipped}`)
  console.log(`  falhas      : ${tally.failed}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
