/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image não suporta alt prop */
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import type { ResolvedTemplate } from "../template-resolver"

export interface CertificateRenderData {
  template: ResolvedTemplate
  studentName: string
  studentCpf?: string | null
  courseName: string
  cargaHoraria?: string | null
  completionDateFormatted: string
  code: string
  unidade: string
  validationUrl: string
  qrCodeDataUrl: string | null
  /**
   * Texto do corpo ja com placeholders substituidos.
   */
  bodyResolved: string
  /**
   * Texto do rodape ja com placeholders substituidos (ou null).
   */
  footerResolved: string | null
  /**
   * Logo do Grupo Bolsa Mais Brasil — selo "powered by" em rodape.
   * Null = renderiza apenas o texto do `groupName`.
   */
  groupLogoUrl: string | null
  /**
   * Nome do grupo exibido junto ao selo de plataforma.
   * Default: "Grupo Bolsa Mais Brasil".
   */
  groupName: string
}

/**
 * Layout CLASSIC: borda dupla dourada/escura, titulo grande centralizado,
 * texto formal, assinatura ao centro inferior. Background opcional ocupa
 * a pagina inteira.
 */
export function ClassicCertificate(data: CertificateRenderData) {
  const t = data.template
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
    content: {
      flex: 1,
      paddingTop: 70,
      paddingBottom: 50,
      paddingHorizontal: 72,
      alignItems: "center",
    },
    logoBox: {
      alignItems: "center",
      marginBottom: 14,
    },
    logo: {
      maxHeight: 70,
      maxWidth: 180,
      objectFit: "contain",
    },
    title: {
      fontSize: 32,
      fontFamily: "Helvetica-Bold",
      color: t.primaryColor,
      letterSpacing: 4,
      marginTop: 4,
      marginBottom: 24,
      textAlign: "center",
    },
    body: {
      fontSize: 14,
      lineHeight: 1.7,
      color: "#1F2937",
      textAlign: "center",
      marginTop: 6,
      marginBottom: 18,
      maxWidth: 620,
    },
    studentName: {
      fontSize: 28,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      marginTop: 8,
      marginBottom: 16,
      textAlign: "center",
    },
    courseInfo: {
      fontSize: 13,
      color: "#374151",
      textAlign: "center",
      marginBottom: 6,
    },
    signatureBlock: {
      marginTop: 30,
      alignItems: "center",
    },
    signature: {
      height: 50,
      objectFit: "contain",
      marginBottom: 4,
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
      position: "absolute",
      bottom: 50,
      left: 72,
      right: 72,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    footerLeft: {
      maxWidth: 320,
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
      maxWidth: 320,
    },
    qrBox: {
      alignItems: "center",
    },
    qrImage: {
      width: 64,
      height: 64,
    },
    qrLabel: {
      fontSize: 7,
      color: "#6B7280",
      marginTop: 3,
    },
    sealBox: {
      position: "absolute",
      top: 90,
      right: 90,
    },
    seal: {
      width: 78,
      height: 78,
      objectFit: "contain",
    },
    groupBrand: {
      position: "absolute",
      bottom: 8,
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    groupLogo: {
      maxHeight: 16,
      maxWidth: 80,
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
      <Page size="A4" orientation="landscape" style={styles.page}>
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

        <View style={styles.content}>
          {t.logoUrl ? (
            <View style={styles.logoBox}>
              <Image src={t.logoUrl} style={styles.logo} />
            </View>
          ) : null}

          <Text style={styles.title}>{t.titleText}</Text>

          <Text style={styles.body}>{data.bodyResolved}</Text>

          <Text style={styles.studentName}>{data.studentName}</Text>

          <Text style={styles.courseInfo}>
            Curso: {data.courseName}
            {data.cargaHoraria ? `  ·  Carga horaria: ${data.cargaHoraria}` : ""}
          </Text>
          <Text style={styles.courseInfo}>
            Concluido em {data.completionDateFormatted}
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

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerCode}>
              Codigo de validacao:{" "}
              <Text style={styles.footerCodeBold}>{data.code}</Text>
            </Text>
            {t.showValidationUrl ? (
              <Text style={styles.footerUrl}>{data.validationUrl}</Text>
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
            Plataforma do{data.groupLogoUrl ? " " : ` ${data.groupName}`}
          </Text>
          {data.groupLogoUrl ? (
            <Image src={data.groupLogoUrl} style={styles.groupLogo} />
          ) : null}
        </View>
      </Page>
    </Document>
  )
}
