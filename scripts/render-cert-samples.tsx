/* eslint-disable */
// Script de inspeção visual dos 3 modelos de certificado.
// Renderiza CLASSIC / MODERN / MINIMAL com dados fictícios e salva PDFs em /tmp/cert-samples.
import { renderToFile, Font } from "@react-pdf/renderer"
import QRCode from "qrcode"
import path from "node:path"
import fs from "node:fs"

// As fontes built-in (Helvetica) do @react-pdf não embutem glifos fora do
// runtime do Next, e o poppler não rasteriza -> texto "some". Para inspeção
// fiel, registramos Arial (TTF do sistema) sob os mesmos nomes usados nos
// templates. Isto é APENAS para o script de preview; não afeta produção.
Font.register({
  family: "Helvetica",
  fonts: [
    { src: "/System/Library/Fonts/Supplemental/Arial.ttf", fontWeight: "normal" },
  ],
})
Font.register({
  family: "Helvetica-Bold",
  fonts: [{ src: "/System/Library/Fonts/Supplemental/Arial Bold.ttf" }],
})
import { renderCertificateByLayout, type CertificateRenderData } from "../src/lib/certificates/templates"
import type { ResolvedTemplate } from "../src/lib/certificates/template-resolver"

const ROOT = path.resolve(__dirname, "..")
const LOGO = path.join(ROOT, "public/images/logo.png")
const OUT = "/tmp/cert-samples"
fs.mkdirSync(OUT, { recursive: true })

function baseTemplate(layout: "CLASSIC" | "MODERN" | "MINIMAL", withAssets: boolean): ResolvedTemplate {
  return {
    layout,
    backgroundUrl: null,
    logoUrl: withAssets ? LOGO : null,
    sealUrl: withAssets ? LOGO : null,
    signatureUrl: withAssets ? LOGO : null,
    primaryColor: "#16653f",
    secondaryColor: "#0f3d24",
    titleText: "CERTIFICADO DE CONCLUSÃO",
    bodyText:
      "Certificamos que {nome} concluiu com aproveitamento o curso de {curso}, com carga horária de {carga_horaria}, em {data_conclusao}.",
    footerText:
      "Este certificado é válido em todo o território nacional. Consulte a autenticidade pelo código de validação acima ou pelo QR code ao lado.",
    signerName: "maria oliveira",
    signerTitle: "diretora acadêmica",
    showQrCode: true,
    showValidationUrl: true,
    showSeal: withAssets,
    groupLogoUrl: withAssets ? LOGO : null,
    groupName: "Grupo Bolsa Mais Brasil",
  }
}

async function makeData(
  layout: "CLASSIC" | "MODERN" | "MINIMAL",
  withAssets: boolean,
): Promise<CertificateRenderData> {
  const t = baseTemplate(layout, withAssets)
  const validationUrl = "https://profissionalizamaisbrasil.com.br/validar/pmb-7k3x9a2"
  const qr = await QRCode.toDataURL(validationUrl, { errorCorrectionLevel: "M", margin: 1, width: 256 })
  const body =
    "certificamos que lucas eduardo da silva araújo concluiu com aproveitamento o curso de informática essencial — windows 10, com carga horária de 40 horas, em 01 de junho de 2026."
  return {
    template: t,
    studentName: "lucas eduardo da silva araújo",
    studentCpf: "123.456.789-00",
    courseName: "informática essencial — windows 10",
    cargaHoraria: "40 horas",
    completionDateFormatted: "01 de junho de 2026",
    code: "pmb-7k3x9a2",
    unidade: "profissionaliza mais brasil",
    validationUrl,
    qrCodeDataUrl: qr,
    bodyResolved: body,
    footerResolved: t.footerText,
    groupLogoUrl: withAssets ? LOGO : null,
    groupName: "Grupo Bolsa Mais Brasil",
  }
}

async function main() {
  const layouts: Array<"CLASSIC" | "MODERN" | "MINIMAL"> = ["CLASSIC", "MODERN", "MINIMAL"]
  for (const layout of layouts) {
    for (const variant of [true, false]) {
      const data = await makeData(layout, variant)
      const el = renderCertificateByLayout(layout, data)
      const file = path.join(OUT, `${layout.toLowerCase()}-${variant ? "full" : "bare"}.pdf`)
      await renderToFile(el, file)
      console.log("wrote", file)
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
