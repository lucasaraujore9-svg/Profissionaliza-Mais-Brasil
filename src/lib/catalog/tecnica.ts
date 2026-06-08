import { prisma } from "@/lib/prisma"
import type { CurrentTenant } from "@/lib/tenant/current"

export interface TecnicaCourse {
  name: string
  url: string
  order: number
  /**
   * Imagem fixa do curso (capa). Definida pela PMB e padronizada para toda a
   * rede — as unidades não alteram. `null` => o card usa um fundo neutro.
   * Aceita URL http(s) ou caminho público relativo (ex: /images/tecnica/x.jpg).
   */
  image: string | null
}

export interface TecnicaConfig {
  enabled: boolean
  url: string | null
  label: string
  /** Lista editável de cursos. Vazia => apenas CTA com a URL base. */
  courses: TecnicaCourse[]
}

const DEFAULT_LABEL = "Cursos Técnicos"
/**
 * Padrão da seção "Cursos Técnicos": exatamente 8 cursos (grid 4×2), igual às
 * seções de categoria com count=8. A lista cadastrada deve ter 0 (seção só com
 * CTA) ou exatamente 8 cursos — validado em `validateTecnicaCoursesInput`.
 */
export const TECNICA_SECTION_COUNT = 8
const MAX_COURSES = TECNICA_SECTION_COUNT

/**
 * Faz parse do JSON cru do Prisma para uma lista de TecnicaCourse normalizada
 * (campos válidos, ordenada). Resiliente a JSON malformado/desconhecido.
 */
export function parseTecnicaCourses(raw: unknown, fallbackUrl: string | null): TecnicaCourse[] {
  if (!Array.isArray(raw)) return []
  const out: TecnicaCourse[] = []
  raw.forEach((item, idx) => {
    if (!item || typeof item !== "object") return
    const obj = item as Record<string, unknown>
    const name = typeof obj.name === "string" ? obj.name.trim() : ""
    const rawUrl = typeof obj.url === "string" ? obj.url.trim() : ""
    const image = typeof obj.image === "string" && obj.image.trim() ? obj.image.trim() : null
    const order = typeof obj.order === "number" && Number.isFinite(obj.order) ? obj.order : idx
    if (!name) return
    // URL: se o curso não tiver URL própria, usa o fallback (tecnicaUrl).
    const url = rawUrl || fallbackUrl || ""
    if (!url) return
    out.push({ name, url, order, image })
  })
  out.sort((a, b) => a.order - b.order)
  return out.slice(0, MAX_COURSES)
}

// Considera enabled apenas quando o flag estiver ligado E a URL estiver
// preenchida — sem URL nao tem pra onde redirecionar.
function buildConfig(
  enabled: boolean,
  url: string | null,
  label: string | null,
  coursesRaw: unknown,
): TecnicaConfig {
  const trimmedUrl = url?.trim() ?? ""
  const safe = enabled && trimmedUrl.length > 0
  const finalUrl = safe ? trimmedUrl : null
  return {
    enabled: safe,
    url: finalUrl,
    label: label?.trim() || DEFAULT_LABEL,
    courses: safe ? parseTecnicaCourses(coursesRaw, finalUrl) : [],
  }
}

export function tecnicaFromTenant(
  tenant: Pick<
    CurrentTenant,
    "tecnicaEnabled" | "tecnicaUrl" | "tecnicaLabel" | "tecnicaCourses"
  > | null,
): TecnicaConfig {
  if (!tenant) return { enabled: false, url: null, label: DEFAULT_LABEL, courses: [] }
  return buildConfig(
    tenant.tecnicaEnabled,
    tenant.tecnicaUrl,
    tenant.tecnicaLabel,
    tenant.tecnicaCourses,
  )
}

/**
 * Lista de cursos técnicos padronizada pela PMB, **independente** do flag
 * `tecnicaEnabled` da PMB — usada para herança nas vitrines dos revendedores
 * (item 10). Assim, mesmo que a PMB não exiba a seção na própria home, a lista
 * institucional continua disponível para padronizar a rede.
 */
export async function loadPmbTecnicaCourses(): Promise<TecnicaCourse[]> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { tecnicaUrl: true, tecnicaCourses: true },
    })
    if (!settings) return []
    // A URL é irrelevante nesta lista de herança: `loadTecnicaSectionContent()`
    // sobrescreve o destino com a URL da própria unidade. Usamos um placeholder
    // não-vazio como fallback para que cursos institucionais cadastrados só com
    // nome+imagem (sem URL própria) NÃO sejam descartados por `parseTecnicaCourses`
    // (que exige `url`). Sem isto, a padronização da rede some quando a PMB não
    // define um `tecnicaUrl` global.
    return parseTecnicaCourses(settings.tecnicaCourses, settings.tecnicaUrl ?? "#")
  } catch {
    return []
  }
}

/**
 * Conteúdo da seção "Cursos Técnicos" para a home.
 *
 * - **PMB (tenantId null):** lista, imagens, rótulo e URL vêm da configuração
 *   institucional (`SystemSettings.tecnica*`).
 * - **Vitrine de revendedor (tenantId):** a **lista e as imagens** são
 *   padronizadas pela PMB (`loadPmbTecnicaCourses`), mas o **link de destino e o
 *   rótulo são do próprio revendedor** (`Tenant.tecnicaUrl/Label`, configurados
 *   pelo admin por unidade). Cada card aponta para o link da unidade. Sem link
 *   configurado, a seção não tem destino e é omitida.
 *
 * **Ignora** `tecnicaEnabled`: a exibição da seção na home é controlada pelo
 * `enabled` do próprio `HomeSection` (kind="tecnica"), não pelo flag de
 * menu/categoria. A unidade só reordena/liga-desliga a seção; não edita cursos.
 */
export async function loadTecnicaSectionContent(
  tenantId: string | null,
): Promise<{ label: string; url: string | null; courses: TecnicaCourse[] }> {
  try {
    if (!tenantId) {
      const settings = await prisma.systemSettings.findUnique({
        where: { id: "default" },
        select: { tecnicaUrl: true, tecnicaLabel: true, tecnicaCourses: true },
      })
      const url = settings?.tecnicaUrl?.trim() || null
      const label = settings?.tecnicaLabel?.trim() || DEFAULT_LABEL
      // Placeholder "#" garante que cursos cadastrados só com nome+imagem (sem
      // URL própria) não sejam descartados por `parseTecnicaCourses` quando não
      // há URL base.
      const courses = parseTecnicaCourses(settings?.tecnicaCourses, url ?? "#")
      return { label, url, courses }
    }

    // Vitrine de revendedor: lista/imagens da PMB + link/rótulo da unidade.
    const [tenant, pmbCourses] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { tecnicaUrl: true, tecnicaLabel: true },
      }),
      loadPmbTecnicaCourses(),
    ])
    const url = tenant?.tecnicaUrl?.trim() || null
    const label = tenant?.tecnicaLabel?.trim() || DEFAULT_LABEL
    // Sem link da unidade não há para onde redirecionar — omite a seção.
    if (!url) return { label, url: null, courses: [] }
    const courses = pmbCourses
      .slice(0, MAX_COURSES)
      .map((c, i) => ({ name: c.name, image: c.image, url, order: i }))
    return { label, url, courses }
  } catch {
    return { label: DEFAULT_LABEL, url: null, courses: [] }
  }
}

export async function loadPmbTecnicaConfig(): Promise<TecnicaConfig> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: {
        tecnicaEnabled: true,
        tecnicaUrl: true,
        tecnicaLabel: true,
        tecnicaCourses: true,
      },
    })
    if (!settings) {
      return { enabled: false, url: null, label: DEFAULT_LABEL, courses: [] }
    }
    return buildConfig(
      settings.tecnicaEnabled,
      settings.tecnicaUrl,
      settings.tecnicaLabel,
      settings.tecnicaCourses,
    )
  } catch {
    return { enabled: false, url: null, label: DEFAULT_LABEL, courses: [] }
  }
}

/**
 * Valida a lista vinda da UI antes de gravar. Retorna lista normalizada ou
 * um erro descritivo.
 */
export function validateTecnicaCoursesInput(
  raw: unknown,
): { ok: true; courses: TecnicaCourse[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, courses: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "courses deve ser uma lista" }
  // Padrão fixo: a seção exibe exatamente 8 cursos. Aceita lista vazia (seção
  // só com CTA) ou exatamente 8 — nunca um número intermediário.
  if (raw.length !== 0 && raw.length !== TECNICA_SECTION_COUNT) {
    return {
      ok: false,
      error: `A seção Cursos Técnicos exige exatamente ${TECNICA_SECTION_COUNT} cursos (ou nenhum). Você enviou ${raw.length}.`,
    }
  }
  const out: TecnicaCourse[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== "object") {
      return { ok: false, error: `Curso #${i + 1}: formato inválido` }
    }
    const obj = item as Record<string, unknown>
    const name = typeof obj.name === "string" ? obj.name.trim() : ""
    const url = typeof obj.url === "string" ? obj.url.trim() : ""
    const image = typeof obj.image === "string" ? obj.image.trim() : ""
    if (!name) {
      return { ok: false, error: `Curso #${i + 1}: nome obrigatório` }
    }
    if (name.length > 120) {
      return { ok: false, error: `Curso #${i + 1}: nome muito longo (máx 120)` }
    }
    // URL pode ser vazia (usa o fallback no parse), mas se vier preenchida
    // tem que ser http(s).
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, error: `Curso #${i + 1}: URL inválida` }
    }
    // Imagem: opcional; aceita http(s) ou caminho público relativo (/...).
    if (image && !/^(https?:\/\/|\/)/i.test(image)) {
      return { ok: false, error: `Curso #${i + 1}: imagem inválida (use https://… ou /caminho)` }
    }
    out.push({ name, url, order: i, image: image || null })
  }
  return { ok: true, courses: out }
}
