import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireArtesManager } from "@/lib/auth/guards"
import { deleteVitrineAsset } from "@/lib/supabase/storage"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { withArtUrls } from "@/lib/artes/admin-upload"

const updateSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    category: z.string().trim().max(60).nullable().optional(),
    hasPrice: z.boolean().optional(),
    logoCorner: z.enum(["top-left", "top-right"]).optional(),
    published: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nada para atualizar" })

// PATCH /api/admin/artes/[id] — edita metadados / publica. Troca de arquivo
// das variantes: POST /api/admin/artes/[id]/file.
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.artes.update", route: "/api/admin/artes/[id]" },
  async (request: Request, { params }) => {
    const guard = await requireArtesManager()
    if (!guard.ok) return guard.response

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = updateSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    try {
      const updated = await prisma.marketingArt.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.category !== undefined ? { category: data.category || null } : {}),
          ...(data.hasPrice !== undefined ? { hasPrice: data.hasPrice } : {}),
          ...(data.logoCorner !== undefined ? { logoCorner: data.logoCorner } : {}),
          ...(data.published !== undefined ? { published: data.published } : {}),
        },
      })
      return NextResponse.json({ data: { art: withArtUrls(updated) } })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return NextResponse.json({ error: "Arte não encontrada" }, { status: 404 })
      }
      throw err
    }
  },
)

// DELETE /api/admin/artes/[id] — remove do banco e apaga os arquivos (feed e
// stories) do bucket.
export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.artes.delete", route: "/api/admin/artes/[id]" },
  async (_request: Request, { params }) => {
    const guard = await requireArtesManager()
    if (!guard.ok) return guard.response

    const { id } = await params

    let paths: (string | null)[]
    try {
      const deleted = await prisma.marketingArt.delete({
        where: { id },
        select: { filePath: true, storyFilePath: true },
      })
      paths = [deleted.filePath, deleted.storyFilePath]
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return NextResponse.json({ error: "Arte não encontrada" }, { status: 404 })
      }
      throw err
    }

    // DB primeiro, storage depois: orfao no bucket nao quebra o fluxo.
    for (const path of paths) {
      if (!path) continue
      try {
        await deleteVitrineAsset(path)
      } catch {
        // best-effort
      }
    }

    return NextResponse.json({ data: { ok: true } })
  },
)
