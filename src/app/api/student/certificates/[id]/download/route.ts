import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import {
  downloadCertificatePdf,
  extractCertificatePath,
} from "@/lib/certificates/storage"

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireStudentSession()
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
  }

  const { id } = await params
  const cert = await prisma.certificate.findUnique({ where: { id } })
  if (!cert) {
    return NextResponse.json(
      { error: "Certificado nao encontrado" },
      { status: 404 },
    )
  }
  if (cert.studentId !== session.studentId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }
  if (cert.revokedAt) {
    return NextResponse.json(
      { error: "Certificado revogado" },
      { status: 410 },
    )
  }

  // Garante PDF gerado (on-demand se ainda nao existir)
  let pdfUrl = cert.pdfUrl
  if (!pdfUrl) {
    try {
      const r = await generateAndUploadPdf(cert.id)
      pdfUrl = r.pdfUrl
    } catch (err) {
      console.error(
        `[student/certificates/download] falha ao gerar PDF ${cert.id}:`,
        err,
      )
      return NextResponse.json(
        { error: "Falha ao gerar PDF" },
        { status: 500 },
      )
    }
  }

  if (!pdfUrl) {
    return NextResponse.json(
      { error: "Certificado sem PDF disponivel" },
      { status: 500 },
    )
  }

  // Stream do PDF (evita expor a URL publica e forca download)
  const path = extractCertificatePath(pdfUrl)
  if (path) {
    try {
      const buffer = await downloadCertificatePdf(path)
      // Defesa em profundidade: cert.code é gerado internamente, mas
      // sanitizar evita CRLF injection caso o gerador mude no futuro.
      const safeCode = String(cert.code).replace(/[^A-Za-z0-9_-]/g, "")
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="certificado-${safeCode}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      })
    } catch (err) {
      console.error(
        `[student/certificates/download] falha ao baixar PDF do bucket ${path}:`,
        err,
      )
      // fallback: redireciona para a URL publica
    }
  }

  return NextResponse.redirect(pdfUrl, { status: 302 })
}
