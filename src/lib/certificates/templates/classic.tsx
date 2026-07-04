/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image não suporta alt prop */
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import { certificateInfoPage, resolveCompletionPercent } from "./info-page"
import type { CertificateRenderData } from "./render-data"

export type { CertificateRenderData } from "./render-data"

/**
 * Layout CLASSIC: borda dupla dourada/escura, titulo grande centralizado,
 * texto formal, assinatura ao centro inferior. Background opcional ocupa
 * a pagina inteira.
 */
export function ClassicCertificate(data: CertificateRenderData) {
  const t = data.template
  const displayUrl = data.validationUrl.replace(/^https?:\/\//, "")
  const pct = resolveCompletionPercent(data.progressPercent)
  const styles = StyleSheet.create({
    page: {
      padding: 0,
      fontFamily: "Helvetica",
      backgroundColor: "#FFFFFF",
    },
    background: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
    },
    outerBorder: {
      position: "absolute",
      top: 24,
      left: 24,
      right: 24,
      bottom: 24,
      borderWidth: 4,
      borderColor: t.primaryColor,
    },
    innerBorder: {
      position: "absolute",
      top: 34,
      left: 34,
      right: 34,
      bottom: 34,
      borderWidth: 1,
      borderColor: t.secondaryColor,
    },
    // Coluna principal: ocupa a pagina inteira e organiza
    // [conteudo centralizado] + [rodape] + [marca] em fluxo flex,
    // garantindo que nada se sobreponha por mais longo que seja o texto.
    main: {
      flex: 1,
      paddingTop: 40,
      paddingBottom: 42,
      paddingHorizontal: 64,
    },
    spacer: {
      flexGrow: 1,
    },
    centerBlock: {
      alignItems: "center",
    },
    logoBox: {
      alignItems: "center",
      marginBottom: 10,
    },
    logo: {
      maxHeight: 54,
      maxWidth: 150,
      objectFit: "contain",
    },
    title: {
      fontSize: 27,
      fontFamily: "Helvetica-Bold",
      color: t.primaryColor,
      letterSpacing: 4,
      marginTop: 2,
      marginBottom: 14,
      textAlign: "center",
    },
    body: {
      fontSize: 12.5,
      lineHeight: 1.6,
      color: "#1F2937",
      textAlign: "center",
      marginTop: 2,
      marginBottom: 10,
      maxWidth: 600,
    },
    studentName: {
      fontSize: 24,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      marginTop: 4,
      marginBottom: 10,
      textAlign: "center",
    },
    courseInfo: {
      fontSize: 12,
      color: "#374151",
      textAlign: "center",
      marginBottom: 4,
    },
    signatureBlock: {
      marginTop: 16,
      alignItems: "center",
    },
    signature: {
      height: 36,
      objectFit: "contain",
      marginBottom: 2,
    },
    signatureLine: {
      width: 220,
      borderTopWidth: 1,
      borderTopColor: "#1F2937",
      marginTop: 4,
    },
    signerName: {
      fontSize: 12,
      fontFamily: "Helvetica-Bold",
      color: "#1F2937",
      marginTop: 6,
    },
    signerTitle: {
      fontSize: 10,
      color: "#6B7280",
      marginTop: 2,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 12,
    },
    footerLeft: {
      flex: 1,
      paddingRight: 16,
    },
    footerCode: {
      fontSize: 9,
      color: "#6B7280",
    },
    footerCodeBold: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
    },
    footerUrl: {
      fontSize: 8,
      color: "#6B7280",
      marginTop: 2,
    },
    footerText: {
      fontSize: 8,
      color: "#6B7280",
      marginTop: 6,
      maxWidth: 360,
    },
    qrBox: {
      alignItems: "center",
      marginLeft: 12,
      backgroundColor: "#FFFFFF",
      padding: 7,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    qrImage: {
      width: 60,
      height: 60,
      backgroundColor: "#FFFFFF",
    },
    qrLabel: {
      fontSize: 7,
      color: "#6B7280",
      marginTop: 3,
    },
    sealBox: {
      position: "absolute",
      top: 92,
      right: 92,
    },
    seal: {
      width: 72,
      height: 72,
      objectFit: "contain",
    },
    // Marca do grupo sobre pilula branca centralizada: sem isto a logo do
    // grupo briga com a decoracao do fundo na base do certificado.
    groupBrand: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      backgroundColor: "#FFFFFF",
      paddingVertical: 3,
      paddingHorizontal: 10,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    groupLogo: {
      maxHeight: 15,
      maxWidth: 78,
      objectFit: "contain",
      marginLeft: 4,
    },
    groupText: {
      fontSize: 7,
      color: "#9CA3AF",
      letterSpacing: 1,
      textAlign: "center",
    },
  })

  return (
    <Document>
      {/* wrap={false}: trava a frente em UMA página física. Sem isto, textos
          longos (curso/nome/rodapé) transbordam e criam uma 3ª página entre a
          frente e o verso (info-page). */}
      <Page size="A4" orientation="landscape" style={styles.page} wrap={false}>
        {t.backgroundUrl ? (
          <Image src={t.backgroundUrl} style={styles.background} fixed />
        ) : null}
        <View style={styles.outerBorder} />
        <View style={styles.innerBorder} />

        {t.showSeal && t.sealUrl ? (
          <View style={styles.sealBox}>
            <Image src={t.sealUrl} style={styles.seal} />
          </View>
        ) : null}

        <View style={styles.main}>
          <View style={styles.spacer} />

          <View style={styles.centerBlock}>
            {t.logoUrl ? (
              <View style={styles.logoBox}>
                <Image src={t.logoUrl} style={styles.logo} />
              </View>
            ) : null}

            <Text style={styles.title}>{t.titleText}</Text>

            <Text style={styles.body}>{data.bodyResolved}</Text>

            <Text style={styles.studentName}>{data.studentName}</Text>

            {data.studentCpf ? (
              <Text style={styles.courseInfo}>CPF: {data.studentCpf}</Text>
            ) : null}
            <Text style={styles.courseInfo}>
              Curso: {data.courseName}
              {data.cargaHoraria
                ? `  ·  Carga horária: ${data.cargaHoraria}`
                : ""}
            </Text>
            <Text style={styles.courseInfo}>
              Concluído em {data.completionDateFormatted}  ·  Aproveitamento: {pct}%
            </Text>

            <View style={styles.signatureBlock}>
              {t.signatureUrl ? (
                <Image src={t.signatureUrl} style={styles.signature} />
              ) : null}
              <View style={styles.signatureLine} />
              {t.signerName ? (
                <Text style={styles.signerName}>{t.signerName}</Text>
              ) : null}
              {t.signerTitle ? (
                <Text style={styles.signerTitle}>{t.signerTitle}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.spacer} />

          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <Text style={styles.footerCode}>
                Código de validação:{" "}
                <Text style={styles.footerCodeBold}>{data.code}</Text>
              </Text>
              {t.showValidationUrl ? (
                <Text style={styles.footerUrl}>{displayUrl}</Text>
              ) : null}
              {data.footerResolved ? (
                <Text style={styles.footerText}>{data.footerResolved}</Text>
              ) : null}
            </View>
            {t.showQrCode && data.qrCodeDataUrl ? (
              <View style={styles.qrBox}>
                <Image src={data.qrCodeDataUrl} style={styles.qrImage} />
                <Text style={styles.qrLabel}>Escaneie para validar</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.groupBrand}>
            <Text style={styles.groupText}>
              {data.groupLogoUrl
                ? "Uma plataforma do "
                : `Uma plataforma do ${data.groupName}`}
            </Text>
            {data.groupLogoUrl ? (
              <Image src={data.groupLogoUrl} style={styles.groupLogo} />
            ) : null}
          </View>
        </View>
      </Page>
      {certificateInfoPage(data)}
    </Document>
  )
}
