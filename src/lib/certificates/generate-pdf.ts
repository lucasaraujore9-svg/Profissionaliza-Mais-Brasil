import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"
import { prisma } from "@/lib/prisma"
import { appDomain } from "@/lib/tenant/urls"
import { PMB_TENANT_NAME, PMB_TENANT_SLUG } from "@/lib/pmb-config"
import {
  applyPlaceholders,
  formatCompletionDate,
  type CertificatePlaceholders,
} from "./placeholders"
import { readSnapshot } from "./template-resolver"
import { renderCertificateByLayout } from "./templates"
import { uploadCertificatePdf } from "./storage"

function validationUrlFor(code: string): string {
  return `https://${appDomain()}/validar/${code}`
}

async function makeQrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    })
  } catch (err) {
    console.error("[certificates] QR code falhou:", err)
    return null
  }
}

function pdfPathFor(tenantId: string | null, code: string): string {
  return `${tenantId ?? "pmb"}/${code}.pdf`
}

/**
 * Gera o PDF do certificado, sobe no Supabase Storage e atualiza
 * Certificate.pdfUrl + pdfGeneratedAt. Idempotente — re-rodar sobrescreve.
 */
export async function generateAndUploadPdf(
  certificateId: string,
): Promise<{ pdfUrl: string }> {
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      tenant: { select: { name: true, slug: true } },
    },
  })
  if (!cert) {
    throw new Error(`Certificate ${certificateId} nao encontrado`)
  }

  const template = readSnapshot(cert.templateSnapshot)
  const unidade = cert.tenantId
    ? cert.tenant?.name ?? PMB_TENANT_NAME
    : PMB_TENANT_NAME

  const placeholders: CertificatePlaceholders = {
    nome: cert.studentName,
    cpf: cert.studentCpf ?? "",
    curso: cert.courseName,
    carga_horaria: cert.cargaHoraria ?? "",
    data_conclusao: formatCompletionDate(cert.completionDate),
    codigo: cert.code,
    unidade,
  }

  const bodyResolved = applyPlaceholders(template.bodyText, placeholders)
  const footerResolved = template.footerText
    ? applyPlaceholders(template.footerText, placeholders)
    : null
  const validationUrl = validationUrlFor(cert.code)
  const qrCodeDataUrl = template.showQrCode
    ? await makeQrDataUrl(validationUrl)
    : null

  const element = renderCertificateByLayout(template.layout, {
    template,
    studentName: cert.studentName,
    studentCpf: cert.studentCpf,
    courseName: cert.courseName,
    cargaHoraria: cert.cargaHoraria,
    completionDateFormatted: formatCompletionDate(cert.completionDate),
    code: cert.code,
    unidade,
    validationUrl,
    qrCodeDataUrl,
    bodyResolved,
    footerResolved,
  })

  const buffer = await renderToBuffer(element)
  const path = pdfPathFor(cert.tenantId, cert.code)
  const upload = await uploadCertificatePdf(path, buffer)

  await prisma.certificate.update({
    where: { id: cert.id },
    data: { pdfUrl: upload.publicUrl, pdfGeneratedAt: new Date() },
  })

  return { pdfUrl: upload.publicUrl }
}

export { pdfPathFor, validationUrlFor }
export { PMB_TENANT_NAME, PMB_TENANT_SLUG }
