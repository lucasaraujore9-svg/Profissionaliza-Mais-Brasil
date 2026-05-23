import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"

/**
 * Dados para renderizar o demonstrativo mensal de comissoes de indicacao.
 * Tudo ja vem formatado em pt-BR para evitar logica condicional no JSX.
 */
export interface DemonstrativoRenderData {
  logoUrl: string | null
  monthLabel: string
  tenant: {
    name: string
    slug: string
    referralCode: string
    pixKey: string | null
    pixKeyType: string | null
  }
  rows: Array<{
    paidAtFormatted: string
    referredName: string
    competenciaFormatted: string
    percentFormatted: string
    amountFormatted: string
    statusLabel: string
  }>
  totals: {
    grossFormatted: string
    irrfFormatted: string
    netFormatted: string
  }
  emittedAtFormatted: string
}

const PMB_GREEN = "#16653f"
const PMB_GREEN_DARK = "#0e4a2d"
const TEXT_DARK = "#1F2937"
const TEXT_MUTED = "#6B7280"
const BORDER = "#E5E7EB"
const ROW_ALT = "#F9FAFB"

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: TEXT_DARK,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: PMB_GREEN,
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 58,
    height: 36,
    objectFit: "contain",
  },
  headerTitleWrap: {
    flexDirection: "column",
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: PMB_GREEN_DARK,
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 9,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  monthBadge: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: PMB_GREEN_DARK,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  monthValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: PMB_GREEN,
    marginTop: 2,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    backgroundColor: PMB_GREEN,
    color: "#FFFFFF",
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  unitGrid: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  unitCell: {
    width: "50%",
    paddingVertical: 4,
    paddingRight: 8,
  },
  unitLabel: {
    fontSize: 8,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  unitValue: {
    fontSize: 10,
    color: TEXT_DARK,
    marginTop: 2,
    fontFamily: "Helvetica-Bold",
  },
  tableWrapper: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
  },
  tableHeadRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableHeadCell: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PMB_GREEN_DARK,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    backgroundColor: ROW_ALT,
  },
  tableCell: {
    fontSize: 9,
    color: TEXT_DARK,
  },
  colDate: { width: "16%" },
  colReferred: { width: "30%" },
  colCompetencia: { width: "16%" },
  colPercent: { width: "10%", textAlign: "right" },
  colAmount: { width: "16%", textAlign: "right" },
  colStatus: { width: "12%", textAlign: "right" },
  emptyRow: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    fontSize: 10,
    color: TEXT_MUTED,
    fontStyle: "italic",
    textAlign: "center",
  },
  totalsBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsLabel: {
    fontSize: 10,
    color: TEXT_DARK,
  },
  totalsValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
  },
  totalsNetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  totalsNetLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: PMB_GREEN_DARK,
  },
  totalsNetValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: PMB_GREEN,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: TEXT_MUTED,
  },
  footerSignature: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PMB_GREEN_DARK,
  },
})

function pixLabel(pixKey: string | null, pixKeyType: string | null): string {
  if (!pixKey) return "Nao cadastrado"
  if (pixKeyType) return `${pixKeyType.toUpperCase()} - ${pixKey}`
  return pixKey
}

export function DemonstrativoDocument(data: DemonstrativoRenderData) {
  const { tenant, rows, totals, monthLabel, emittedAtFormatted, logoUrl } = data
  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title}>
                Demonstrativo de Comissao de Indicacao
              </Text>
              <Text style={styles.subtitle}>Profissionaliza Mais Brasil</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.monthBadge}>Mes de referencia</Text>
            <Text style={styles.monthValue}>{monthLabel}</Text>
          </View>
        </View>

        {/* Dados da unidade */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Dados da unidade</Text>
          <View style={styles.unitGrid}>
            <View style={styles.unitCell}>
              <Text style={styles.unitLabel}>Unidade</Text>
              <Text style={styles.unitValue}>{tenant.name}</Text>
            </View>
            <View style={styles.unitCell}>
              <Text style={styles.unitLabel}>Slug</Text>
              <Text style={styles.unitValue}>{tenant.slug}</Text>
            </View>
            <View style={styles.unitCell}>
              <Text style={styles.unitLabel}>Codigo de indicacao</Text>
              <Text style={styles.unitValue}>{tenant.referralCode}</Text>
            </View>
            <View style={styles.unitCell}>
              <Text style={styles.unitLabel}>Chave PIX</Text>
              <Text style={styles.unitValue}>
                {pixLabel(tenant.pixKey, tenant.pixKeyType)}
              </Text>
            </View>
          </View>
        </View>

        {/* Tabela de comissoes */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Comissoes pagas no periodo</Text>
          <View style={styles.tableWrapper}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.tableHeadCell, styles.colDate]}>Data</Text>
              <Text style={[styles.tableHeadCell, styles.colReferred]}>
                Indicado
              </Text>
              <Text style={[styles.tableHeadCell, styles.colCompetencia]}>
                Mensalidade
              </Text>
              <Text style={[styles.tableHeadCell, styles.colPercent]}>%</Text>
              <Text style={[styles.tableHeadCell, styles.colAmount]}>
                Valor
              </Text>
              <Text style={[styles.tableHeadCell, styles.colStatus]}>
                Status
              </Text>
            </View>
            {rows.length === 0 ? (
              <Text style={styles.emptyRow}>
                Nenhuma comissao paga neste periodo.
              </Text>
            ) : (
              rows.map((row, idx) => (
                <View
                  key={`${row.paidAtFormatted}-${idx}`}
                  style={
                    idx % 2 === 1
                      ? [styles.tableRow, styles.tableRowAlt]
                      : styles.tableRow
                  }
                >
                  <Text style={[styles.tableCell, styles.colDate]}>
                    {row.paidAtFormatted}
                  </Text>
                  <Text style={[styles.tableCell, styles.colReferred]}>
                    {row.referredName}
                  </Text>
                  <Text style={[styles.tableCell, styles.colCompetencia]}>
                    {row.competenciaFormatted}
                  </Text>
                  <Text style={[styles.tableCell, styles.colPercent]}>
                    {row.percentFormatted}
                  </Text>
                  <Text style={[styles.tableCell, styles.colAmount]}>
                    {row.amountFormatted}
                  </Text>
                  <Text style={[styles.tableCell, styles.colStatus]}>
                    {row.statusLabel}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Totais */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Totais</Text>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Total bruto</Text>
              <Text style={styles.totalsValue}>{totals.grossFormatted}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>IRRF (Imposto)</Text>
              <Text style={styles.totalsValue}>{totals.irrfFormatted}</Text>
            </View>
            <View style={styles.totalsNetRow}>
              <Text style={styles.totalsNetLabel}>Total liquido a receber</Text>
              <Text style={styles.totalsNetValue}>{totals.netFormatted}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Emitido em {emittedAtFormatted}
          </Text>
          <Text style={styles.footerSignature}>
            Profissionaliza Mais Brasil
          </Text>
        </View>
      </Page>
    </Document>
  )
}
