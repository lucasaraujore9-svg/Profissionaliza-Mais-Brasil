import { prisma } from "@/lib/prisma"
import { generateAndUploadPdf } from "./generate-pdf"
import { contextLogger } from "@/lib/logger"

const SETTINGS_ID = "default"

export interface CertificatePdfRef {
  id: string
  tenantId: string | null
  pdfUrl: string | null
  pdfGeneratedAt: Date | null
}

/**
 * Um PDF de certificado fica DESATUALIZADO quando qualquer fonte de design
 * muda depois de `pdfGeneratedAt`:
 * - template global PMB (layout, cores, textos, fundo, assinatura) — unidades
 *   herdam todo o design dele;
 * - template da unidade (escolha de layout do revendedor);
 * - tenant (logo da unidade exibida no certificado);
 * - SystemSettings (logo/nome do Grupo no rodapé).
 *
 * Comparar timestamps cobre tanto "Salvar" no editor quanto uploads de assets
 * (ambos tocam `updatedAt` da linha). Falha de leitura => considera atual
 * (não bloqueia o download por causa da checagem).
 */
export async function isCertificatePdfStale(
  cert: Pick<CertificatePdfRef, "tenantId" | "pdfUrl" | "pdfGeneratedAt">,
): Promise<boolean> {
  if (!cert.pdfUrl || !cert.pdfGeneratedAt) return true
  const generatedAt = cert.pdfGeneratedAt.getTime()

  try {
    const [globalTemplate, tenantTemplate, tenant, settings] = await Promise.all([
      prisma.certificateTemplate.findFirst({
        where: { tenantId: null },
        select: { updatedAt: true },
      }),
      cert.tenantId
        ? prisma.certificateTemplate.findUnique({
            where: { tenantId: cert.tenantId },
            select: { updatedAt: true },
          })
        : null,
      cert.tenantId
        ? prisma.tenant.findUnique({
            where: { id: cert.tenantId },
            select: { updatedAt: true },
          })
        : null,
      prisma.systemSettings.findUnique({
        where: { id: SETTINGS_ID },
        select: { updatedAt: true },
      }),
    ])

    const sources = [globalTemplate, tenantTemplate, tenant, settings]
    return sources.some(
      (s) => s?.updatedAt && s.updatedAt.getTime() > generatedAt,
    )
  } catch (err) {
    contextLogger().warn(
      { err, event: "certificates.staleness_check_failed" },
      "checagem de atualidade do PDF falhou — assumindo PDF atual",
    )
    return false
  }
}

/**
 * Garante que o PDF servido reflita o modelo VIGENTE do certificado.
 * Regenera quando não há PDF ou quando o template/branding mudou depois da
 * última geração. Se a regeneração falhar mas existir um PDF antigo, serve o
 * antigo (melhor entregar o certificado desatualizado do que erro 500).
 *
 * Retorna a URL do PDF ou null quando não há PDF e a geração falhou.
 */
export async function ensureFreshCertificatePdf(
  cert: CertificatePdfRef,
): Promise<string | null> {
  const stale = await isCertificatePdfStale(cert)
  if (cert.pdfUrl && !stale) return cert.pdfUrl

  try {
    const { pdfUrl } = await generateAndUploadPdf(cert.id)
    return pdfUrl
  } catch (err) {
    contextLogger().error(
      {
        err,
        event: "certificates.pdf_refresh_failed",
        certificateId: cert.id,
        hadPdf: Boolean(cert.pdfUrl),
      },
      "falha ao (re)gerar PDF do certificado",
    )
    return cert.pdfUrl
  }
}
