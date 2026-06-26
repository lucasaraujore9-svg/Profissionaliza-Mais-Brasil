import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { requireStudentSession } from "@/lib/auth/student-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Marca um tour guiado como visto/dispensado para o usuário logado, para que
 * não auto-reabra. Atende tanto a sessão de revendedor/consultor (User) quanto
 * a de aluno (Student) — cada uma persiste no seu próprio `dismissedTours`.
 *
 * Body: `{ tourId: string }`. Idempotente (não duplica no array).
 */
const BodySchema = z.object({
  tourId: z.string().min(1).max(120),
})

export const POST = withRequestContext(
  { action: "tours.dismiss", route: "/api/tours/dismiss" },
  async (req: Request) => {
    let tourId: string
    try {
      const parsed = BodySchema.parse(await req.json())
      tourId = parsed.tourId
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }

    // Revendedor / consultor (User).
    const reseller = await requireResellerSession()
    if (reseller) {
      const user = await prisma.user.findUnique({
        where: { id: reseller.userId },
        select: { dismissedTours: true },
      })
      if (user && !user.dismissedTours.includes(tourId)) {
        await prisma.user.update({
          where: { id: reseller.userId },
          data: { dismissedTours: { push: tourId } },
        })
      }
      return NextResponse.json({ ok: true })
    }

    // Aluno (Student).
    const student = await requireStudentSession()
    if (student) {
      const row = await prisma.student.findUnique({
        where: { id: student.studentId },
        select: { dismissedTours: true },
      })
      if (row && !row.dismissedTours.includes(tourId)) {
        await prisma.student.update({
          where: { id: student.studentId },
          data: { dismissedTours: { push: tourId } },
        })
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  },
)
