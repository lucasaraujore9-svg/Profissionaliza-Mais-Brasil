/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image não suporta alt prop */
import type { ReactElement } from "react"
import { Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import type { CertificateRenderData } from "./render-data"

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
 * Percentual de conclusão impresso no certificado — SEMPRE 100%.
 *
 * Antes isto era `Enrollment.progressPercent` lido AO VIVO na hora de gerar o
 * PDF. Dois defeitos num documento oficial:
 *
 * 1. **Contradição.** O documento se intitula "certificado de CONCLUSÃO";
 *    imprimir "Aproveitamento: 67%" nele afirma duas coisas incompatíveis. E o
 *    número nunca foi nota: é o percentual de AULAS ASSISTIDAS reportado pela
 *    plataforma de aulas, que marca "CONCLUÍDO" com percentual abaixo de 100
 *    (o próprio contrato da EA documenta `CONCLUÍDO / 95%`, e há certificados
 *    em produção emitidos com 88% e 97%).
 * 2. **Instabilidade.** Sendo leitura ao vivo — e como o PDF é regerado sob
 *    demanda por `ensureFreshCertificatePdf` — o MESMO certificado podia
 *    imprimir números diferentes a cada download, conforme o progresso
 *    sincronizasse depois da emissão.
 *
 * A premissa já estava escrita no código anterior, que assumia 100% quando o
 * progresso vinha nulo/zero "pois a emissão de um certificado de CONCLUSÃO
 * pressupõe o término do curso". O que faltava era aplicá-la sempre, inclusive
 * quando havia um valor parcial para vazar.
 */
export const CERTIFICATE_COMPLETION_PERCENT = 100

/**
 * Densidade da grade da matriz curricular em função da quantidade de tópicos.
 *
 * O verso é travado em UMA página (`wrap={false}`): listas mais longas precisam
 * de mais colunas e fonte menor para caber sem transbordar. As faixas foram
 * calibradas para o pior caso real (~94 tópicos / ~2.100 caracteres) ainda caber
 * com folga em A4 paisagem, mantendo legibilidade nas listas curtas.
 */
function matrizDensity(count: number): {
  columns: number
  fontSize: number
  lineHeight: number
  rowGap: number
  bulletSize: number
} {
  if (count <= 12) return { columns: 2, fontSize: 9.5, lineHeight: 1.4, rowGap: 5, bulletSize: 9 }
  if (count <= 24) return { columns: 3, fontSize: 8.5, lineHeight: 1.35, rowGap: 4, bulletSize: 8 }
  if (count <= 40) return { columns: 3, fontSize: 8, lineHeight: 1.3, rowGap: 3, bulletSize: 8 }
  if (count <= 56) return { columns: 4, fontSize: 7.5, lineHeight: 1.3, rowGap: 2.5, bulletSize: 7 }
  if (count <= 75) return { columns: 5, fontSize: 7, lineHeight: 1.28, rowGap: 2, bulletSize: 7 }
  if (count <= 96) return { columns: 6, fontSize: 6.5, lineHeight: 1.25, rowGap: 1.5, bulletSize: 6 }
  return { columns: 6, fontSize: 6, lineHeight: 1.2, rowGap: 1.5, bulletSize: 6 }
}

/**
 * Página 2 (verso) do certificado — compartilhada pelos 3 layouts (classic,
 * modern, minimal). Exibe: dados acadêmicos, o **percentual de conclusão do
 * curso**, a **matriz curricular** (quando há) e a **fundamentação legal**
 * (Decreto Presidencial nº 5.154).
 *
 * Layout em UMA página física (`wrap={false}`): dados acadêmicos e aproveitamento
 * dividem uma faixa horizontal (aproveitando a largura da paisagem) e a matriz
 * curricular usa uma grade de densidade adaptativa — assim mesmo a maior matriz
 * cabe no verso sem gerar uma 3ª página.
 */
export function certificateInfoPage(data: CertificateRenderData): ReactElement {
  const t = data.template
  const pct = CERTIFICATE_COMPLETION_PERCENT
  const displayUrl = data.validationUrl.replace(/^https?:\/\//, "")
  const matriz = (data.matrizCurricular ?? []).filter((s) => s.trim().length > 0)
  const hasMatriz = matriz.length > 0
  const d = matrizDensity(matriz.length)

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
      paddingTop: 40,
      paddingBottom: 38,
      paddingHorizontal: 54,
    },
    header: {
      fontSize: 16,
      fontFamily: "Helvetica-Bold",
      color: t.primaryColor,
      letterSpacing: 2,
      textAlign: "center",
      marginBottom: 2,
    },
    subHeader: {
      fontSize: 9,
      color: "#6B7280",
      textAlign: "center",
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 9.5,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
      letterSpacing: 1.5,
      marginBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: "#E5E7EB",
      paddingBottom: 3,
    },
    // Faixa horizontal: dados acadêmicos à esquerda, aproveitamento à direita.
    // Aproveita a largura da paisagem para encurtar a altura usada no topo.
    infoBand: {
      flexDirection: "row",
      marginBottom: 16,
    },
    infoLeft: {
      width: "60%",
      paddingRight: 24,
    },
    infoRight: {
      width: "40%",
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    field: {
      width: "50%",
      marginBottom: 6,
      paddingRight: 10,
    },
    fieldFull: {
      width: "100%",
      marginBottom: 6,
    },
    fieldLabel: {
      fontSize: 7.5,
      color: "#9CA3AF",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 1,
    },
    fieldValue: {
      fontSize: 10.5,
      color: "#1F2937",
    },
    fieldValueMono: {
      fontSize: 10.5,
      fontFamily: "Helvetica-Bold",
      color: t.secondaryColor,
    },
    // Bloco de aproveitamento (percentual de conclusão)
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    progressPct: {
      fontSize: 24,
      fontFamily: "Helvetica-Bold",
      color: t.primaryColor,
      marginRight: 10,
    },
    progressLabel: {
      fontSize: 9,
      color: "#374151",
      flex: 1,
    },
    barTrack: {
      height: 9,
      borderRadius: 5,
      backgroundColor: "#E5E7EB",
      width: "100%",
    },
    barFill: {
      height: 9,
      borderRadius: 5,
      backgroundColor: t.primaryColor,
    },
    legalText: {
      fontSize: 7.5,
      lineHeight: 1.45,
      color: "#4B5563",
      textAlign: "justify",
    },
    // Matriz curricular (conteúdo programático) — grade de densidade adaptativa
    matrizList: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 8,
    },
    matrizItem: {
      width: `${100 / d.columns}%`,
      flexDirection: "row",
      paddingRight: 8,
      marginBottom: d.rowGap,
    },
    matrizBullet: {
      fontSize: d.bulletSize,
      color: t.secondaryColor,
      marginRight: 4,
      lineHeight: d.lineHeight,
    },
    matrizText: {
      flex: 1,
      fontSize: d.fontSize,
      lineHeight: d.lineHeight,
      color: "#374151",
    },
    matrizNote: {
      fontSize: 7,
      fontFamily: "Helvetica-Oblique",
      color: "#9CA3AF",
      marginBottom: 10,
    },
    spacer: {
      flexGrow: 1,
      minHeight: 8,
    },
    footer: {
      marginTop: 12,
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
    // wrap={false}: trava o verso em UMA página física. Mesmo a maior matriz
    // curricular cabe via grade adaptativa (matrizDensity); sem isto, listas
    // longas geravam uma 3ª página.
    <Page
      size="A4"
      orientation="landscape"
      style={styles.page}
      wrap={false}
    >
      <View style={styles.border} />

      <View style={styles.main}>
        <Text style={styles.header}>INFORMAÇÕES DO CERTIFICADO</Text>
        <Text style={styles.subHeader}>{data.unidade}</Text>

        {/* Faixa: dados acadêmicos (esq.) + aproveitamento (dir.) */}
        <View style={styles.infoBand}>
          <View style={styles.infoLeft}>
            <Text style={styles.sectionTitle}>DADOS ACADÊMICOS</Text>
            <View style={styles.grid}>
              <View style={data.studentCpf ? styles.field : styles.fieldFull}>
                <Text style={styles.fieldLabel}>Aluno(a)</Text>
                <Text style={styles.fieldValue}>{data.studentName}</Text>
              </View>
              {data.studentCpf ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>CPF</Text>
                  <Text style={styles.fieldValue}>{data.studentCpf}</Text>
                </View>
              ) : null}
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
          </View>

          <View style={styles.infoRight}>
            <Text style={styles.sectionTitle}>APROVEITAMENTO</Text>
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
        </View>

        {/* Matriz curricular — só quando o curso tem matriz oficial */}
        {hasMatriz ? (
          <>
            <Text style={styles.sectionTitle}>MATRIZ CURRICULAR</Text>
            <View style={styles.matrizList}>
              {matriz.map((topico, idx) => (
                <View key={idx} style={styles.matrizItem} wrap={false}>
                  <Text style={styles.matrizBullet}>•</Text>
                  <Text style={styles.matrizText}>{topico}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.matrizNote}>
              *As informações podem sofrer alterações sem aviso prévio.
            </Text>
          </>
        ) : null}

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
