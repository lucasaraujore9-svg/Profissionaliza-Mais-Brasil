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
import { certificateInfoPage } from "./info-page"

/**
 * Layout MODERN: barra lateral colorida solida com logo + barra superior
 * fina com gradiente. Foco no nome do aluno (tipografia leve + grande).
 */
export function ModernCertificate(data: CertificateRenderData) {
  const t = data.template
  const displayUrl = data.validationUrl.replace(/^https?:\/\//, "")
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
      paddingTop: 56,
      paddingBottom: 40,
      paddingHorizontal: 22,
      alignItems: "center",
      justifyContent: "space-between",
    },
    sidebarTop: {
      alignItems: "center",
    },
    sidebarLogo: {
      maxWidth: 122,
      maxHeight: 88,
      objectFit: "contain",
    },
    sidebarSealBox: {
      alignItems: "center",
    },
    sidebarSeal: {
      width: 76,
      height: 76,
      objectFit: "contain",
      marginBottom: 12,
    },
    sidebarUnidade: {
      fontSize: 9,
      color: "#FFFFFF",
      textAlign: "center",
      letterSpacing: 1.4,
    },
    // Coluna de conteudo: bloco superior cresce (flexGrow) empurrando o
    // rodape para a base — assim assinatura, QR e marca nunca se sobrepoem.
    content: {
      flex: 1,
      paddingTop: 56,
      paddingBottom: 34,
      paddingHorizontal: 52,
    },
    contentTop: {
      flexGrow: 1,
    },
    eyebrow: {
      fontSize: 10,
      letterSpacing: 6,
      color: t.primaryColor,
      fontFamily: "Helvetica-Bold",
      marginBottom: 6,
    },
    title: {
      fontSize: 26,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      letterSpacing: 2,
      marginBottom: 22,
    },
    body: {
      fontSize: 12,
      lineHeight: 1.7,
      color: "#374151",
      marginTop: 4,
      marginBottom: 12,
    },
    studentNameLabel: {
      fontSize: 9,
      color: "#9CA3AF",
      letterSpacing: 3,
      textTransform: "uppercase",
      marginTop: 6,
      marginBottom: 4,
    },
    studentName: {
      fontSize: 32,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      marginBottom: 8,
    },
    accentBar: {
      width: 72,
      height: 3,
      backgroundColor: t.primaryColor,
      marginBottom: 20,
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
      marginTop: 20,
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
      alignItems: "center",
    },
    qrImage: {
      width: 60,
      height: 60,
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
      marginTop: 3,
    },
    // Rodape em fluxo: separador de linha + texto + URL + marca, empilhados
    // com espacamento — sem position absolute, sem sobreposicao.
    footerDivider: {
      borderTopWidth: 1,
      borderTopColor: "#E5E7EB",
      marginTop: 16,
      marginBottom: 8,
    },
    footerText: {
      fontSize: 8,
      color: "#6B7280",
      lineHeight: 1.5,
    },
    footerUrl: {
      fontSize: 7,
      color: "#9CA3AF",
      marginTop: 3,
    },
    groupBrand: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    groupLogo: {
      maxHeight: 15,
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
            ) : null}
          </View>
          <View style={styles.sidebarSealBox}>
            {t.showSeal && t.sealUrl ? (
              <Image src={t.sealUrl} style={styles.sidebarSeal} />
            ) : null}
            <Text style={styles.sidebarUnidade}>{data.unidade}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.contentTop}>
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
                <Text style={{ color: "#6B7280" }}>Carga horária: </Text>
                {data.cargaHoraria}
              </Text>
            ) : null}
            <Text style={styles.courseInfo}>
              <Text style={{ color: "#6B7280" }}>Conclusão: </Text>
              {data.completionDateFormatted}
            </Text>
          </View>

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
            {t.showQrCode && data.qrCodeDataUrl ? (
              <View style={styles.qrBlock}>
                <Image src={data.qrCodeDataUrl} style={styles.qrImage} />
                <Text style={styles.qrLabel}>Validação</Text>
                <Text style={styles.code}>{data.code}</Text>
              </View>
            ) : (
              <View style={styles.qrBlock}>
                <Text style={styles.qrLabel}>Código de validação</Text>
                <Text style={styles.code}>{data.code}</Text>
              </View>
            )}
          </View>

          <View style={styles.footerDivider} />
          {data.footerResolved ? (
            <Text style={styles.footerText}>{data.footerResolved}</Text>
          ) : null}
          {t.showValidationUrl ? (
            <Text style={styles.footerUrl}>Validar em {displayUrl}</Text>
          ) : null}

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
