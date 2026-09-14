import { NextResponse } from "next/server"
import {
  requireStudentSession,
  studentSessionWasReplaced,
} from "@/lib/auth/student-session"

export const dynamic = "force-dynamic"

/**
 * A sessão deste aparelho ainda vale? Consultado pela área do aluno enquanto a
 * tela está aberta (`StudentSessionWatch`).
 *
 * Sem isto, o aparelho derrubado por um login em outro só descobriria no próximo
 * clique — e uma aba parada numa tela continuaria parecendo logada. A checagem de
 * verdade é a do callback `jwt` (`requireStudentSession`); aqui só se devolve o
 * resultado, sem dado nenhum do aluno.
 */
export async function GET() {
  const session = await requireStudentSession()
  if (session) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  }
  const replaced = await studentSessionWasReplaced()
  return NextResponse.json(
    { ok: false, code: replaced ? "SESSION_REPLACED" : "UNAUTHENTICATED" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  )
}
