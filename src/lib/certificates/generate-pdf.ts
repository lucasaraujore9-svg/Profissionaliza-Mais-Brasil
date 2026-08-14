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
  resolveCertificateTemplate,
  type ResolvedTemplate,
} from "./template-resolver"
import { renderCertificateByLayout } from "./templates"
import { uploadCertificatePdf } from "./storage"
import { validationUrlFor } from "./urls"
import { lowerCert, upperCert } from "./text"
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
  /**
   * Matriz curricular do curso (conteúdo programático). Exibida no verso.
   * Vazia/ausente => o verso segue o layout atual, sem a seção.
   */
  matrizCurricular?: string[]
  completionDate: Date
  code: string
  /** Nome da unidade emissora exibido no certificado. */
  unidade: string
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
  // Nomes e parametros do certificado sao sempre exibidos em MAIUSCULO
  // (regra de negocio). upperCert centraliza a normalizacao.
  const placeholders: CertificatePlaceholders = {
    nome: upperCert(fields.studentName),
    cpf: upperCert(fields.studentCpf),
    curso: upperCert(fields.courseName),
    carga_horaria: upperCert(fields.cargaHoraria),
    data_conclusao: upperCert(formatCompletionDate(fields.completionDate)),
    codigo: upperCert(fields.code),
    unidade: upperCert(fields.unidade),
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
    studentName: upperCert(fields.studentName),
    studentCpf: fields.studentCpf ? upperCert(fields.studentCpf) : null,
    courseName: upperCert(fields.courseName),
    cargaHoraria: fields.cargaHoraria ? upperCert(fields.cargaHoraria) : null,
    // Tópicos da matriz mantêm a capitalização original (são frases), ao
    // contrário dos demais campos que vão em MAIÚSCULO.
    matrizCurricular: fields.matrizCurricular ?? [],
    completionDateFormatted: upperCert(formatCompletionDate(fields.completionDate)),
    code: upperCert(fields.code),
    unidade: upperCert(fields.unidade),
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
 * `Certificate.pdfUrl` + `pdfGeneratedAt`. Idempotente — re-rodar sobrescreve.
 *
 * `pdfUrl` guarda o **path do objeto no bucket** (`"{tenant}/{certId}.pdf"`), NÃO
 * a URL pública: o bucket `certificates` contém PDF com CPF+nome (PII) e todo
 * read-path serve via signed URL/stream service-role. Persistir o path evita
 * gravar uma URL pública permanente no banco (DB-001/LGPD-001) e mantém o valor
 * portável para a migração Storage→MinIO (OPS-005). O nome do retorno segue
 * `pdfUrl` por compatibilidade — os chamadores derivam o path com
 * `extractCertificatePath`, que aceita o path puro e a URL pública legada.
 */
export async function generateAndUploadPdf(
  certificateId: string,
): Promise<{ pdfUrl: string }> {
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      tenant: { select: { name: true, slug: true } },
      course: { select: { matrizCurricular: true } },
    },
  })
  if (!cert) {
    throw new Error(`Certificate ${certificateId} nao encontrado`)
  }

  // Resolve o template ATUAL (layout + cores + textos + logo da unidade +
  // branding do grupo) em vez do snapshot congelado na emissão. Assim a geração
  // — e principalmente "Regenerar PDFs" — reaplica de fato o modelo vigente:
  // trocar o layout/template no admin e regenerar atualiza os PDFs já emitidos.
  // O snapshot (cert.templateSnapshot) continua gravado na emissão apenas como
  // registro histórico/auditoria do que estava ativo naquele momento.
  const template = await resolveCertificateTemplate(cert.tenantId)
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
    matrizCurricular: cert.course?.matrizCurricular ?? [],
    completionDate: cert.completionDate,
    code: cert.code,
    unidade,
  })
  const path = pdfPathFor(cert.tenantId, cert.id)
  const upload = await uploadCertificatePdf(path, buffer)

  // Persiste o PATH do objeto (não a URL pública com PII) — ver docstring.
  await prisma.certificate.update({
    where: { id: cert.id },
    data: { pdfUrl: upload.path, pdfGeneratedAt: new Date() },
  })

  return { pdfUrl: upload.path }
}

export { pdfPathFor, validationUrlFor }
export { PMB_TENANT_NAME, PMB_TENANT_SLUG }
