/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image não suporta alt prop */
import type { ReactElement } from "react"
import { Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import type { CertificateRenderData } from "./classic"

/**
 * Base legal dos certificados de cursos livres. Exibida no verso (página 2) de
 * todos os layouts. Cursos livres de qualificação profissional são amparados
 * pelo Decreto Presidencial nº 5.154/2004, que regulamenta os arts. 39 a 42 da
 * Lei nº 9.394/1996 (LDB).
 */
export const LEGAL_BASIS_TITLE = "FUNDAMENTAÇÃO LEGAL"
export const LEGAL_BASIS_TEXT =
  "Os cursos livres de qualificação profissional são legais e reconhecidos com base no " +
  "Decreto Presidencial nº 5.154, de 23 de julho de 2004, que regulamenta os artigos 39 a 42 " +
  "da Lei nº 9.394/1996 (Lei de Diretrizes e Bases da Educação Nacional – LDB). " +
  "Os cursos livres independem de autorização prévia e não exigem escolaridade mínima, conforme " +
  "a legislação vigente. Este certificado comprova a participação e o aproveitamento do(a) " +
  "aluno(a) no curso livre indicado e não substitui diploma de curso técnico, de graduação ou " +
  "de pós-graduação."

/**
 * Calcula o percentual de conclusão a exibir. Usa o progresso real da matrícula
 * (sincronizado da plataforma) quando disponível; na ausência (0/null) assume
 * 100%, pois a emissão de um certificado de CONCLUSÃO pressupõe o término do curso.
 */
export function resolveCompletionPercent(
  progressPercent: number | null | undefined,
): number {
  if (typeof progressPercent === "number" && progressPercent > 0) {
    return Math.min(100, Math.round(progressPercent))
  }
  return 100
}

/**
 * Página 2 (verso) do certificado — compartilhada pelos 3 layouts (classic,
 * modern, minimal). Exibe: dados acadêmicos, o **percentual de conclusão do
 * curso** e a **fundamentação legal** (Decreto Presidencial nº 5.154).
 */
export function certificateInfoPage(data: CertificateRenderData): ReactElement {
  const t = data.template
  const pct = resolveCompletionPercent(data.progressPercent)
  const displayUrl = data.validationUrl.replace(/^https?:\/\//, "")

  const styles = StyleSheet.create({
    page: {
      padding: 0,
      fontFamily: "Helvetica",
      backgroundColor: "#FFFFFF",
    },
    border: {
      position: "absolute",
      top: 24,
      left: 24,
      right: 24,
      bottom: 24,
      borderWidth: 1.5,
      borderColor: t.primaryColor,
    },
    main: {
      flex: 1,
      paddingTop: 48,
      paddingBottom: 44,
      paddingHorizontal: 70,
    },
    header: {
      fontSize: 18,
      fontFamily: "Helvetica-Bold",
      color: t.primaryColor,
      letterSpacing: 2,
      textAlign: "center",
      marginBottom: 4,
    },
    subHeader: {
      fontSize: 9,
      color: "#6B7280",
      textAlign: "center",
      marginBottom: 22,
    },
    sectionTitle: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      letterSpacing: 1.5,
      marginBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: "#E5E7EB",
      paddingBottom: 4,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 20,
    },
    field: {
      width: "50%",
      marginBottom: 10,
      paddingRight: 12,
    },
    fieldFull: {
      width: "100%",
      marginBottom: 10,
    },
    fieldLabel: {
      fontSize: 8,
      color: "#9CA3AF",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    fieldValue: {
      fontSize: 11.5,
      color: "#1F2937",
    },
    fieldValueMono: {
      fontSize: 11.5,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
    },
    // Bloco de aproveitamento (percentual de conclusão)
    progressBlock: {
      marginBottom: 20,
    },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    progressPct: {
      fontSize: 26,
      fontFamily: "Helvetica-Bold",
      color: t.primaryColor,
      marginRight: 10,
    },
    progressLabel: {
      fontSize: 10,
      color: "#374151",
      flex: 1,
    },
    barTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: "#E5E7EB",
      width: "100%",
    },
    barFill: {
      height: 10,
      borderRadius: 5,
      backgroundColor: t.primaryColor,
    },
    legalText: {
      fontSize: 8.5,
      lineHeight: 1.6,
      color: "#4B5563",
      textAlign: "justify",
    },
    spacer: {
      flexGrow: 1,
    },
    footer: {
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: "#E5E7EB",
      paddingTop: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    footerText: {
      fontSize: 7.5,
      color: "#9CA3AF",
    },
    groupBrand: {
      flexDirection: "row",
      alignItems: "center",
    },
    groupLogo: {
      maxHeight: 14,
      maxWidth: 72,
      objectFit: "contain",
      marginLeft: 4,
    },
  })

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.border} />

      <View style={styles.main}>
        <Text style={styles.header}>INFORMAÇÕES DO CERTIFICADO</Text>
        <Text style={styles.subHeader}>{data.unidade}</Text>

        {/* Dados acadêmicos */}
        <Text style={styles.sectionTitle}>DADOS ACADÊMICOS</Text>
        <View style={styles.grid}>
          <View style={styles.fieldFull}>
            <Text style={styles.fieldLabel}>Aluno(a)</Text>
            <Text style={styles.fieldValue}>{data.studentName}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Curso</Text>
            <Text style={styles.fieldValue}>{data.courseName}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Carga horária</Text>
            <Text style={styles.fieldValue}>{data.cargaHoraria ?? "—"}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Data de conclusão</Text>
            <Text style={styles.fieldValue}>{data.completionDateFormatted}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Código de validação</Text>
            <Text style={styles.fieldValueMono}>{data.code}</Text>
          </View>
        </View>

        {/* Aproveitamento / percentual de conclusão */}
        <Text style={styles.sectionTitle}>APROVEITAMENTO</Text>
        <View style={styles.progressBlock}>
          <View style={styles.progressRow}>
            <Text style={styles.progressPct}>{pct}%</Text>
            <Text style={styles.progressLabel}>
              Percentual de conclusão do curso pelo(a) aluno(a).
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </View>

        {/* Fundamentação legal */}
        <Text style={styles.sectionTitle}>{LEGAL_BASIS_TITLE}</Text>
        <Text style={styles.legalText}>{LEGAL_BASIS_TEXT}</Text>

        <View style={styles.spacer} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Validação: {displayUrl} · Código {data.code}
          </Text>
          <View style={styles.groupBrand}>
            <Text style={styles.footerText}>
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
  )
}
