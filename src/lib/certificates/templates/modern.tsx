/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image não suporta alt prop */
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
 * Layout MODERN: barra lateral colorida solida com logo + barra superior
 * fina com gradiente. Foco no nome do aluno (tipografia leve + grande).
 */
export function ModernCertificate(data: CertificateRenderData) {
  const t = data.template
  const styles = StyleSheet.create({
    page: {
      padding: 0,
      fontFamily: "Helvetica",
      backgroundColor: "#FFFFFF",
      flexDirection: "row",
    },
    background: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
    },
    sidebar: {
      width: 170,
      backgroundColor: t.primaryColor,
      paddingTop: 60,
      paddingBottom: 40,
      paddingHorizontal: 24,
      alignItems: "center",
      justifyContent: "space-between",
    },
    sidebarTop: {
      alignItems: "center",
    },
    sidebarLogo: {
      maxWidth: 120,
      maxHeight: 90,
      objectFit: "contain",
    },
    sidebarSealBox: {
      alignItems: "center",
    },
    sidebarSeal: {
      width: 80,
      height: 80,
      objectFit: "contain",
    },
    sidebarUnidade: {
      fontSize: 9,
      color: "#FFFFFF",
      textAlign: "center",
      letterSpacing: 1.4,
      marginTop: 16,
    },
    sidebarUnidadeTop: {
      marginTop: 0,
    },
    content: {
      flex: 1,
      paddingTop: 64,
      paddingBottom: 50,
      paddingHorizontal: 56,
      position: "relative",
    },
    eyebrow: {
      fontSize: 10,
      letterSpacing: 6,
      color: t.primaryColor,
      fontFamily: "Helvetica-Bold",
      marginBottom: 6,
    },
    title: {
      fontSize: 28,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      letterSpacing: 2,
      marginBottom: 24,
    },
    body: {
      fontSize: 12,
      lineHeight: 1.7,
      color: "#374151",
      marginTop: 4,
      marginBottom: 14,
    },
    studentNameLabel: {
      fontSize: 9,
      color: "#9CA3AF",
      letterSpacing: 3,
      textTransform: "uppercase",
      marginTop: 8,
      marginBottom: 4,
    },
    studentName: {
      fontSize: 34,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      marginBottom: 8,
    },
    accentBar: {
      width: 72,
      height: 3,
      backgroundColor: t.primaryColor,
      marginBottom: 24,
    },
    courseInfo: {
      fontSize: 11,
      color: "#374151",
      marginBottom: 4,
    },
    signatureRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginTop: 30,
    },
    signatureBlock: {
      maxWidth: 220,
    },
    signature: {
      height: 40,
      objectFit: "contain",
      marginBottom: 2,
    },
    signatureLine: {
      width: 200,
      borderTopWidth: 1,
      borderTopColor: "#1F2937",
      marginTop: 2,
    },
    signerName: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: "#1F2937",
      marginTop: 4,
    },
    signerTitle: {
      fontSize: 9,
      color: "#6B7280",
      marginTop: 1,
    },
    qrBlock: {
      alignItems: "flex-end",
    },
    qrImage: {
      width: 64,
      height: 64,
    },
    qrLabel: {
      fontSize: 7,
      color: "#6B7280",
      marginTop: 2,
    },
    code: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: t.primaryColor,
      marginTop: 4,
    },
    footerUrl: {
      fontSize: 7,
      color: "#9CA3AF",
    },
    footerText: {
      fontSize: 8,
      color: "#6B7280",
      marginTop: 8,
    },
    groupBrand: {
      position: "absolute",
      bottom: 14,
      left: 56,
      right: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    groupLogo: {
      maxHeight: 16,
      maxWidth: 70,
      objectFit: "contain",
      marginLeft: 4,
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
          <Image src={t.backgroundUrl} style={styles.background} fixed />
        ) : null}
        <View style={styles.sidebar}>
          <View style={styles.sidebarTop}>
            {t.logoUrl ? (
              <Image src={t.logoUrl} style={styles.sidebarLogo} />
            ) : (
              <Text style={[styles.sidebarUnidade, styles.sidebarUnidadeTop]}>
                {data.unidade}
              </Text>
            )}
          </View>
          <View style={styles.sidebarSealBox}>
            {t.showSeal && t.sealUrl ? (
              <Image src={t.sealUrl} style={styles.sidebarSeal} />
            ) : null}
            <Text style={styles.sidebarUnidade}>{data.unidade}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.eyebrow}>CERTIFICADO</Text>
          <Text style={styles.title}>{t.titleText}</Text>

          <Text style={styles.body}>{data.bodyResolved}</Text>

          <Text style={styles.studentNameLabel}>Aluno(a)</Text>
          <Text style={styles.studentName}>{data.studentName}</Text>
          <View style={styles.accentBar} />

          <Text style={styles.courseInfo}>
            <Text style={{ color: "#6B7280" }}>Curso: </Text>
            {data.courseName}
          </Text>
          {data.cargaHoraria ? (
            <Text style={styles.courseInfo}>
              <Text style={{ color: "#6B7280" }}>Carga horaria: </Text>
              {data.cargaHoraria}
            </Text>
          ) : null}
          <Text style={styles.courseInfo}>
            <Text style={{ color: "#6B7280" }}>Conclusao: </Text>
            {data.completionDateFormatted}
          </Text>

          <View style={styles.signatureRow}>
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
              {t.showQrCode && data.qrCodeDataUrl ? (
                <Text style={styles.qrLabel}>Validacao</Text>
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
            <Text style={styles.groupText}>
              Plataforma do{data.groupLogoUrl ? " " : ` ${data.groupName}`}
            </Text>
            {data.groupLogoUrl ? (
              <Image src={data.groupLogoUrl} style={styles.groupLogo} />
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  )
}
