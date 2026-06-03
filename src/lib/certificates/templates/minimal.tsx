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
 * Layout MINIMAL: muito espaco em branco, tipografia leve,
 * uma linha de cor fina como detalhe. Sem bordas pesadas.
 */
export function MinimalCertificate(data: CertificateRenderData) {
  const t = data.template
  const displayUrl = data.validationUrl.replace(/^https?:\/\//, "")
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
    // Coluna unica em fluxo: cabecalho + conteudo (cresce) + rodape.
    // Sem position absolute no rodape -> nada se sobrepoe.
    content: {
      flex: 1,
      paddingTop: 70,
      paddingBottom: 36,
      paddingHorizontal: 84,
    },
    contentTop: {
      flexGrow: 1,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 36,
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
      marginBottom: 26,
    },
    intro: {
      fontSize: 11,
      color: "#6B7280",
      marginBottom: 6,
    },
    studentName: {
      fontSize: 40,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      marginBottom: 16,
    },
    body: {
      fontSize: 12,
      lineHeight: 1.7,
      color: "#374151",
      marginBottom: 32,
      maxWidth: 560,
    },
    metaRow: {
      flexDirection: "row",
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
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 24,
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
      alignItems: "center",
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
    footerMeta: {
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: "#E5E7EB",
      paddingTop: 8,
    },
    footerText: {
      fontSize: 7,
      color: "#9CA3AF",
      lineHeight: 1.5,
    },
    footerUrl: {
      fontSize: 7,
      color: "#9CA3AF",
      marginTop: 2,
    },
    groupBrand: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    groupLogo: {
      maxHeight: 15,
      maxWidth: 64,
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
        <View style={styles.topBar} />

        <View style={styles.content}>
          <View style={styles.contentTop}>
            <View style={styles.headerRow}>
              {t.logoUrl ? (
                <Image src={t.logoUrl} style={styles.logo} />
              ) : (
                <Text style={styles.unidade}>{data.unidade}</Text>
              )}
              {t.logoUrl ? (
                <Text style={styles.unidade}>{data.unidade}</Text>
              ) : null}
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
                  <Text style={styles.metaLabel}>Carga horária</Text>
                  <Text style={styles.metaValue}>{data.cargaHoraria}</Text>
                </View>
              ) : null}
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Conclusão</Text>
                <Text style={styles.metaValue}>
                  {data.completionDateFormatted}
                </Text>
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
            </View>
          </View>

          <View style={styles.footerMeta}>
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
        </View>
      </Page>
      {certificateInfoPage(data)}
    </Document>
  )
}
