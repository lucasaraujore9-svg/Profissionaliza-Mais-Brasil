import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"
import { prisma } from "@/lib/prisma"
import { PMB_PUBLIC_NAME, PMB_TENANT_NAME, PMB_TENANT_SLUG } from "@/lib/pmb-config"
import {
  applyPlaceholders,
  formatCompletionDate,
  type CertificatePlaceholders,
} from "./placeholders"
import {
  readSnapshot,
  refreshGroupBranding,
  type ResolvedTemplate,
} from "./template-resolver"
import { renderCertificateByLayout } from "./templates"
import { uploadCertificatePdf } from "./storage"
import { validationUrlFor } from "./urls"
import { lowerCert } from "./text"
import { contextLogger } from "@/lib/logger"

async function makeQrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    })
  } catch (err) {
    contextLogger().error(
      { err, event: "certificates.qrcode_failed" },
      "geração do QR code do certificado falhou",
    )
    return null
  }
}

function pdfPathFor(tenantId: string | null, certId: string): string {
  // Usa o id (cuid) do certificado, NÃO o `code` público. O `code` aparece em
  // /validar/{code} (~28 bits) — usá-lo no path tornava a URL do PDF enumerável,
  // permitindo raspagem em massa de PDFs com CPF (R1). O cuid não é exposto e é
  // estável (re-gerar sobrescreve o mesmo objeto — mantém idempotência).
  return `${tenantId ?? "pmb"}/${certId}.pdf`
}

/**
 * Dados de um certificado (do aluno + curso) necessários para renderizar o PDF.
 * `completionDate` ainda é um Date — a formatação BR acontece aqui dentro.
 */
export interface CertificateRenderFields {
  studentName: string
  studentCpf: string | null
  courseName: string
  cargaHoraria: string | null
  completionDate: Date
  code: string
  /** Nome da unidade emissora exibido no certificado. */
  unidade: string
  /** Percentual de conclusão do curso (0-100); null => assume 100% na página 2. */
  progressPercent: number | null
}

/**
 * Renderiza o buffer PDF de um certificado a partir de um template já resolvido
 * e dos dados do aluno/curso. É o coração compartilhado entre a emissão real
 * (`generateAndUploadPdf`) e os previews — assim o que se vê no preview é
 * exatamente o que será emitido (mesma normalização, placeholders e layout).
 */
export async function renderCertificateBuffer(
  template: ResolvedTemplate,
  fields: CertificateRenderFields,
): Promise<Buffer> {
  // Nomes e parametros do certificado sao sempre exibidos em minusculo
  // (regra de negocio). lowerCert centraliza a normalizacao.
  const placeholders: CertificatePlaceholders = {
    nome: lowerCert(fields.studentName),
    cpf: lowerCert(fields.studentCpf),
    curso: lowerCert(fields.courseName),
    carga_horaria: lowerCert(fields.cargaHoraria),
    data_conclusao: lowerCert(formatCompletionDate(fields.completionDate)),
    codigo: lowerCert(fields.code),
    unidade: lowerCert(fields.unidade),
  }

  const bodyResolved = applyPlaceholders(template.bodyText, placeholders)
  const footerResolved = template.footerText
    ? applyPlaceholders(template.footerText, placeholders)
    : null
  // URL exibida e codificada no QR em minusculo. A rota /validar normaliza o
  // codigo com toUpperCase(), entao o link continua validando.
  const validationUrl = lowerCert(validationUrlFor(fields.code))
  const qrCodeDataUrl = template.showQrCode
    ? await makeQrDataUrl(validationUrl)
    : null

  const element = renderCertificateByLayout(template.layout, {
    template,
    studentName: lowerCert(fields.studentName),
    studentCpf: fields.studentCpf ? lowerCert(fields.studentCpf) : null,
    courseName: lowerCert(fields.courseName),
    cargaHoraria: fields.cargaHoraria ? lowerCert(fields.cargaHoraria) : null,
    completionDateFormatted: lowerCert(formatCompletionDate(fields.completionDate)),
    code: lowerCert(fields.code),
    unidade: lowerCert(fields.unidade),
    progressPercent: fields.progressPercent,
    validationUrl,
    qrCodeDataUrl,
    bodyResolved,
    footerResolved,
    groupLogoUrl: template.groupLogoUrl,
    groupName: template.groupName,
  })

  return renderToBuffer(element)
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
      enrollment: { select: { progressPercent: true } },
    },
  })
  if (!cert) {
    throw new Error(`Certificate ${certificateId} nao encontrado`)
  }

  // Snapshot preserva texto/cores/layout. O branding do grupo (logo + nome)
  // sempre reflete o estado ATUAL do SystemSettings — assim trocar a logo
  // no admin se propaga em re-emissoes sem precisar editar snapshots antigos.
  const template = await refreshGroupBranding(readSnapshot(cert.templateSnapshot))
  // Nome da unidade exibido no certificado (visto pelo aluno). Para a vitrine
  // PMB usa o nome público (sem o sufixo interno "(Vitrine)"). Unidades de
  // revendedores usam o próprio nome do tenant.
  const unidade = cert.tenantId
    ? cert.tenant?.name ?? PMB_PUBLIC_NAME
    : PMB_PUBLIC_NAME

  const buffer = await renderCertificateBuffer(template, {
    studentName: cert.studentName,
    studentCpf: cert.studentCpf,
    courseName: cert.courseName,
    cargaHoraria: cert.cargaHoraria,
    completionDate: cert.completionDate,
    code: cert.code,
    unidade,
    progressPercent: cert.enrollment?.progressPercent ?? null,
  })
  const path = pdfPathFor(cert.tenantId, cert.id)
  const upload = await uploadCertificatePdf(path, buffer)

  await prisma.certificate.update({
    where: { id: cert.id },
    data: { pdfUrl: upload.publicUrl, pdfGeneratedAt: new Date() },
  })

  return { pdfUrl: upload.publicUrl }
}

export { pdfPathFor, validationUrlFor }
export { PMB_TENANT_NAME, PMB_TENANT_SLUG }
