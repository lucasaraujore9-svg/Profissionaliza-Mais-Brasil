import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import type { CertificateRenderData } from "./classic"

/**
 * Layout MINIMAL: muito espaco em branco, tipografia leve,
 * uma linha de cor fina como detalhe. Sem bordas pesadas.
 */
export function MinimalCertificate(data: CertificateRenderData) {
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
    topBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 6,
      backgroundColor: t.primaryColor,
    },
    content: {
      flex: 1,
      paddingTop: 88,
      paddingBottom: 70,
      paddingHorizontal: 90,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 40,
    },
    logo: {
      maxHeight: 50,
      maxWidth: 160,
      objectFit: "contain",
    },
    unidade: {
      fontSize: 9,
      letterSpacing: 3,
      color: "#6B7280",
      textTransform: "uppercase",
    },
    title: {
      fontSize: 14,
      letterSpacing: 6,
      color: t.primaryColor,
      fontFamily: "Helvetica-Bold",
      marginBottom: 4,
    },
    titleLine: {
      width: 40,
      height: 2,
      backgroundColor: t.primaryColor,
      marginBottom: 28,
    },
    intro: {
      fontSize: 11,
      color: "#6B7280",
      marginBottom: 6,
    },
    studentName: {
      fontSize: 42,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      marginBottom: 18,
    },
    body: {
      fontSize: 12,
      lineHeight: 1.7,
      color: "#374151",
      marginBottom: 40,
      maxWidth: 540,
    },
    metaRow: {
      flexDirection: "row",
      marginBottom: 36,
    },
    metaItem: {
      maxWidth: 200,
      marginRight: 36,
    },
    metaLabel: {
      fontSize: 8,
      letterSpacing: 2,
      color: "#9CA3AF",
      textTransform: "uppercase",
      marginBottom: 3,
    },
    metaValue: {
      fontSize: 11,
      color: "#1F2937",
    },
    footerRow: {
      position: "absolute",
      bottom: 60,
      left: 90,
      right: 90,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    signatureBlock: {
      maxWidth: 220,
    },
    signature: {
      height: 36,
      objectFit: "contain",
      marginBottom: 2,
    },
    signatureLine: {
      width: 180,
      borderTopWidth: 1,
      borderTopColor: "#1F2937",
      marginTop: 2,
    },
    signerName: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#1F2937",
      marginTop: 4,
    },
    signerTitle: {
      fontSize: 8,
      color: "#6B7280",
      marginTop: 1,
    },
    qrBlock: {
      alignItems: "flex-end",
    },
    qrImage: {
      width: 56,
      height: 56,
    },
    code: {
      fontSize: 9,
      color: t.primaryColor,
      fontFamily: "Helvetica-Bold",
      marginTop: 4,
    },
    footerUrl: {
      fontSize: 7,
      color: "#9CA3AF",
    },
    footerText: {
      fontSize: 7,
      color: "#9CA3AF",
      position: "absolute",
      bottom: 30,
      left: 90,
      right: 90,
      textAlign: "center",
    },
    groupBrand: {
      position: "absolute",
      bottom: 12,
      left: 90,
      right: 90,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    groupLogo: {
      maxHeight: 16,
      maxWidth: 64,
      objectFit: "contain",
      marginRight: 6,
    },
    groupText: {
      fontSize: 7,
      color: "#9CA3AF",
      letterSpacing: 1,
    },
  })

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {t.backgroundUrl ? (
          <Image src={t.backgroundUrl} style={styles.background} />
        ) : null}
        <View style={styles.topBar} />

        <View style={styles.content}>
          <View style={styles.headerRow}>
            {t.logoUrl ? (
              <Image src={t.logoUrl} style={styles.logo} />
            ) : (
              <Text style={styles.unidade}>{data.unidade}</Text>
            )}
            <Text style={styles.unidade}>{data.unidade}</Text>
          </View>

          <Text style={styles.title}>{t.titleText}</Text>
          <View style={styles.titleLine} />

          <Text style={styles.intro}>Certificamos que</Text>
          <Text style={styles.studentName}>{data.studentName}</Text>

          <Text style={styles.body}>{data.bodyResolved}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Curso</Text>
              <Text style={styles.metaValue}>{data.courseName}</Text>
            </View>
            {data.cargaHoraria ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Carga horaria</Text>
                <Text style={styles.metaValue}>{data.cargaHoraria}</Text>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Conclusao</Text>
              <Text style={styles.metaValue}>{data.completionDateFormatted}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footerRow}>
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
          <View style={styles.qrBlock}>
            {t.showQrCode && data.qrCodeDataUrl ? (
              <Image src={data.qrCodeDataUrl} style={styles.qrImage} />
            ) : null}
            <Text style={styles.code}>{data.code}</Text>
            {t.showValidationUrl ? (
              <Text style={styles.footerUrl}>{data.validationUrl}</Text>
            ) : null}
          </View>
        </View>

        {data.footerResolved ? (
          <Text style={styles.footerText}>{data.footerResolved}</Text>
        ) : null}

        <View style={styles.groupBrand}>
          {data.groupLogoUrl ? (
            <Image src={data.groupLogoUrl} style={styles.groupLogo} />
          ) : null}
          <Text style={styles.groupText}>
            Plataforma do {data.groupName}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
