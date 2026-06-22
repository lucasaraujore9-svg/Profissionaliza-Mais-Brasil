import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buscarAluno } from "@/lib/plataforma-cursos/client"
import { encrypt, decrypt } from "@/lib/crypto"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Backfill operacional: ressincroniza `ea_aluno_senha` (snapshot cifrado da
 * senha da plataforma de aulas) com o valor AUTORITATIVO da EA, relido via
 * `usuarios/listar`. Corrige retratos defasados — ex.: o painel exibia
 * `mrmc3112` enquanto a senha real de login na EA era `4978048`.
 *
 * Roda no runtime de produção (onde EA_API_* e ENCRYPTION_KEY existem), porque
 * esses segredos são "Sensitive" na Vercel e não podem ser extraídos para rodar
 * o script localmente. Disparado via `app_internal.run_cron('/api/cron/...')`.
 *
 * Auth: Bearer CRON_SECRET (padrão dos demais crons).
 *
 * Query params:
 *   ids=4373,4374   limita a alunos específicos (ea_aluno_id)
 *   write=1         grava (default: dry-run, não altera nada)
 *   reveal=1        inclui as senhas em texto plano no retorno (verificação)
 *   limit=1000      teto de alunos varridos quando ids não é passado
 */
function parseExternalId(value: string | null): number | null {
  if (!value || value.startsWith("pending")) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function decode(encrypted: string | null): string | null {
  if (!encrypted) return null
  try {
    return decrypt(encrypted)
  } catch {
    return null
  }
}

interface Outcome {
  eaId: string
  nome: string
  status: "updated" | "unchanged" | "skipped" | "failed"
  old?: string
  new?: string
}

async function resync(opts: {
  ids: string[]
  write: boolean
  reveal: boolean
  limit: number
}) {
  const students = await prisma.student.findMany({
    where: opts.ids.length
      ? { plataformaAlunoId: { in: opts.ids } }
      : { plataformaAlunoId: { not: { startsWith: "pending" } } },
    select: {
      id: true,
      nome: true,
      plataformaAlunoId: true,
      plataformaAlunoSenha: true,
    },
    ...(opts.ids.length ? {} : { take: opts.limit }),
  })

  const tally = { scanned: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 }
  const details: Outcome[] = []
  const CONCURRENCY = 5

  async function processOne(s: (typeof students)[number]): Promise<void> {
    const eaId = parseExternalId(s.plataformaAlunoId)
    if (eaId === null) {
      tally.skipped++
      return
    }
    tally.scanned++

    let real = ""
    try {
      const aluno = await buscarAluno({ id: eaId })
      real = aluno?.senha != null ? String(aluno.senha).trim() : ""
    } catch {
      tally.failed++
      details.push({ eaId: s.plataformaAlunoId, nome: s.nome, status: "failed" })
      return
    }

    if (!real) {
      tally.skipped++
      details.push({ eaId: s.plataformaAlunoId, nome: s.nome, status: "skipped" })
      return
    }

    const current = decode(s.plataformaAlunoSenha)
    if (current === real) {
      tally.unchanged++
      if (opts.reveal) {
        details.push({
          eaId: s.plataformaAlunoId,
          nome: s.nome,
          status: "unchanged",
          old: current ?? undefined,
          new: real,
        })
      }
      return
    }

    if (opts.write) {
      await prisma.student.update({
        where: { id: s.id },
        data: { plataformaAlunoSenha: encrypt(real) },
      })
    }
    tally.updated++
    details.push({
      eaId: s.plataformaAlunoId,
      nome: s.nome,
      status: "updated",
      ...(opts.reveal ? { old: current ?? undefined, new: real } : {}),
    })
  }

  for (let i = 0; i < students.length; i += CONCURRENCY) {
    await Promise.all(students.slice(i, i + CONCURRENCY).map(processOne))
  }

  contextLogger().info(
    { event: "cron.resync_platform_passwords", write: opts.write, ...tally },
    "backfill de senha da plataforma concluído",
  )
  return { write: opts.write, tally, details }
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const url = new URL(request.url)
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const write = url.searchParams.get("write") === "1"
  const reveal = url.searchParams.get("reveal") === "1"
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000) || 1000, 5000)

  const result = await resync({ ids, write, reveal, limit })
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
