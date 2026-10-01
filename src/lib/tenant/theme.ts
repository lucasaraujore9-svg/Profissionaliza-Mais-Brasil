/**
 * IDENTIDADE VISUAL DA UNIDADE — fonte única.
 *
 * A unidade escolhe duas cores da marca (`primaryColor`, `secondaryColor`) e,
 * se quiser, ajusta cada papel em separado (`Tenant.theme`). Este módulo é o
 * único lugar que transforma isso em tokens de CSS — loja, login, checkout e
 * área do aluno leem o MESMO resultado, e a prévia do painel importa daqui para
 * nunca mostrar uma cor que a loja não vai pintar.
 *
 * PURO de propósito: o formulário do painel é client component.
 *
 * ── Automático é o padrão ─────────────────────────────────────────────────
 * Todo campo de `TenantTheme` nulo significa "o sistema decide". Decidir é:
 *   - botão comum e área escura herdam a cor principal;
 *   - botão de destaque herda a cor de destaque;
 *   - todo TEXTO sobre cor é escolhido pelo contraste (branco ou tinta escura);
 *   - título em área clara usa a cor principal, escurecida se ela for clara
 *     demais para ser lida sobre branco.
 * O público é leigo: quem só escolhe a cor da marca nunca fica com texto
 * ilegível, e quem ajusta na mão é avisado (`themeWarnings`) sem ser bloqueado.
 */

export type Tone = "light" | "dark"

export interface TenantTheme {
  /** Botões comuns (Entrar, Pagar, Continuar). */
  buttonBg: string | null
  buttonText: string | null
  /** Botões de destaque (Comprar, Quero estudar). */
  ctaBg: string | null
  ctaText: string | null
  /** Títulos e links sobre fundo claro. */
  lightTitle: string | null
  /** Faixas escuras: rodapé, banners, topo das páginas. */
  darkBg: string | null
  darkText: string | null
  headerTone: Tone
  footerTone: Tone
  studentMenuTone: Tone
}

export const DEFAULT_THEME: TenantTheme = {
  buttonBg: null,
  buttonText: null,
  ctaBg: null,
  ctaText: null,
  lightTitle: null,
  darkBg: null,
  darkText: null,
  // A estrutura de hoje: topo claro, rodapé e menu do aluno escuros.
  headerTone: "light",
  footerTone: "dark",
  studentMenuTone: "dark",
}

const COLOR_KEYS = [
  "buttonBg",
  "buttonText",
  "ctaBg",
  "ctaText",
  "lightTitle",
  "darkBg",
  "darkText",
] as const
const TONE_KEYS = ["headerTone", "footerTone", "studentMenuTone"] as const

export type ThemeColorKey = (typeof COLOR_KEYS)[number]

/** Padrão da plataforma — igual ao globals.css. Divergir faria toda unidade que
    "não mexeu na cor" ser tratada como cor customizada. */
const PMB_GREEN = "#025918"
const PMB_GREEN_700 = "#014712"
const PMB_GREEN_900 = "#012e0b"
const PMB_GOLD = "#f2b705"
const PMB_GOLD_600 = "#d9a304"
const PMB_LIME = "#c0d904"

const WHITE = "#ffffff"
/** Tinta para texto sobre cor clara. Sobre qualquer fundo em que o branco
    reprova (`MIN_CONTRAST`), esta passa de 6:1. */
const INK = "#111827"

/**
 * Abaixo disso a pessoa não lê: é o limiar do automático E do aviso do painel.
 *
 * 2,5 e não os 3:1 da WCAG, calibrado nas cores REAIS das unidades (out/2026):
 * com 3, laranja e azul-claro de marca (#eb7d24, #db7e14, #249eeb — todos entre
 * 2,8 e 2,9 com branco) trocariam o texto branco por tinta escura no rodapé e
 * nos banners, e a unidade leria isso como "mudaram meu site". Com 2,5 só as
 * cores claras de verdade (amarelos, ~1,5) viram — onde o branco já era
 * ilegível. Quem quiser mais contraste escolhe a cor do texto à mão.
 */
const MIN_CONTRAST = 2.5
/** Alvo ao escurecer um título: o texto corrido da WCAG. */
const TEXT_CONTRAST = 4.5

/**
 * Aceita só `#rgb`/`#rrggbb` e devolve `#rrggbb` minúsculo. O valor é
 * interpolado dentro de uma tag `<style>`: qualquer coisa fora disso é
 * DESCARTADA, não escapada — um `}` no meio fecharia a regra e o resto viraria
 * CSS arbitrário na página de todo aluno daquela unidade.
 */
export function safeHex(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim().toLowerCase()
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return null
  if (v.length === 7) return v
  return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
}

/**
 * Lê `Tenant.theme` (Json). NUNCA lança e resolve todo valor inválido para o
 * automático: é lido no caminho quente de toda página da loja, e um JSON
 * corrompido não pode derrubar a vitrine nem deixá-la sem cor.
 */
export function parseTheme(raw: unknown): TenantTheme {
  const theme: TenantTheme = { ...DEFAULT_THEME }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return theme
  const src = raw as Record<string, unknown>
  for (const key of COLOR_KEYS) theme[key] = safeHex(src[key])
  for (const key of TONE_KEYS) {
    if (src[key] === "light" || src[key] === "dark") theme[key] = src[key]
  }
  return theme
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]
}

/** Luminância relativa (WCAG 2.x) de um hex já normalizado por `safeHex`. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Texto legível sobre `bg`: branco enquanto der para ler, senão tinta escura. */
export function readableOn(bg: string): string {
  return contrastRatio(WHITE, bg) >= MIN_CONTRAST ? WHITE : INK
}

/** Mistura com preto em sRGB. `amount` 0..1. */
function darken(hex: string, amount: number): string {
  return (
    "#" +
    channels(hex)
      .map((c) =>
        Math.round(c * (1 - amount))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  )
}

/** Cor da marca legível como TEXTO sobre branco: ela mesma, ou escurecida. */
function readableInk(color: string): string {
  if (contrastRatio(color, WHITE) >= MIN_CONTRAST) return color
  for (let amount = 0.05; amount < 1; amount += 0.05) {
    const candidate = darken(color, amount)
    if (contrastRatio(candidate, WHITE) >= TEXT_CONTRAST) return candidate
  }
  return INK
}

export interface ThemeSource {
  primaryColor: string | null | undefined
  secondaryColor: string | null | undefined
  theme?: unknown
}

export interface ResolvedTheme {
  /** Títulos e links sobre fundo claro (a "tinta" da marca). */
  ink: string
  btn: string
  btnHover: string
  btnOn: string
  cta: string
  ctaHover: string
  ctaOn: string
  dark: string
  darkDeep: string
  darkOn: string
  /** Detalhes coloridos sobre a área escura (rótulos, ícones). */
  darkAccent: string
  darkHighlight: string
  /** Cor de destaque crua (selos, preços, ícones). */
  accent: string
  headerTone: Tone
  footerTone: Tone
  studentMenuTone: Tone
  /** Nada foi personalizado: a página fica com os padrões do globals.css. */
  isDefault: boolean
}

export function resolveTheme(source: ThemeSource): ResolvedTheme {
  const primary = safeHex(source.primaryColor) ?? PMB_GREEN
  const accent = safeHex(source.secondaryColor) ?? PMB_GOLD
  const theme = parseTheme(source.theme)

  const btn = theme.buttonBg ?? primary
  const cta = theme.ctaBg ?? accent
  const dark = theme.darkBg ?? primary
  const darkOn = theme.darkText ?? readableOn(dark)
  // Um detalhe colorido só fica na área escura se der para ler ali; senão ele
  // assume a cor do texto. Sem isso, o lime da plataforma sumia sobre a faixa
  // de uma unidade de cor clara.
  const onDark = (color: string) =>
    contrastRatio(color, dark) >= MIN_CONTRAST ? color : darkOn

  const isDefault =
    primary === PMB_GREEN &&
    accent === PMB_GOLD &&
    COLOR_KEYS.every((key) => theme[key] === null)

  return {
    ink: theme.lightTitle ?? readableInk(primary),
    btn,
    // Os tons da plataforma são calibrados à mão; para cor de unidade, derivamos.
    btnHover: btn === PMB_GREEN ? PMB_GREEN_700 : darken(btn, 0.14),
    btnOn: theme.buttonText ?? readableOn(btn),
    cta,
    ctaHover: cta === PMB_GOLD ? PMB_GOLD_600 : darken(cta, 0.1),
    // No padrão da plataforma o texto do botão dourado é o verde da marca.
    ctaOn: theme.ctaText ?? (cta === PMB_GOLD ? PMB_GREEN : readableOn(cta)),
    dark,
    darkDeep: dark === PMB_GREEN ? PMB_GREEN_900 : darken(dark, 0.35),
    darkOn,
    darkAccent: onDark(PMB_LIME),
    darkHighlight: onDark(accent),
    accent,
    headerTone: theme.headerTone,
    footerTone: theme.footerTone,
    studentMenuTone: theme.studentMenuTone,
    isDefault,
  }
}

/**
 * CSS que aplica a identidade na página inteira, ou `null` quando a unidade
 * está no padrão da plataforma (não injeta `<style>` à toa).
 *
 * Vai em `:root`, não num `<div style>`: diálogos e menus suspensos são
 * renderizados em portal, FORA de qualquer wrapper — num `div` eles ficavam
 * com o verde da plataforma dentro da loja da unidade.
 */
export function tenantThemeCss(source: ThemeSource | null): string | null {
  if (!source) return null
  const t = resolveTheme(source)
  if (t.isDefault) return null

  const vars: Array<[string, string]> = [
    ["--brand-btn", t.btn],
    ["--brand-btn-hover", t.btnHover],
    ["--brand-btn-on", t.btnOn],
    ["--brand-cta", t.cta],
    ["--brand-cta-hover", t.ctaHover],
    ["--brand-cta-on", t.ctaOn],
    ["--brand-dark", t.dark],
    ["--brand-dark-deep", t.darkDeep],
    ["--brand-dark-on", t.darkOn],
    ["--brand-dark-accent", t.darkAccent],
    ["--brand-dark-highlight", t.darkHighlight],
    // Componentes shadcn (Button padrão, foco) seguem o botão da unidade.
    ["--primary", t.btn],
    ["--primary-foreground", t.btnOn],
    ["--ring", t.ink],
  ]

  // A rampa verde da plataforma só é trocada quando a tinta da unidade difere
  // dela; do contrário os três tons calibrados continuam valendo.
  if (t.ink !== PMB_GREEN) {
    for (const suffix of ["", "-700", "-900"]) {
      vars.push([`--brand-ink${suffix}`, t.ink])
      vars.push([`--color-pmb-green${suffix}`, t.ink])
    }
  }
  if (t.accent !== PMB_GOLD) {
    vars.push(["--color-pmb-gold", t.accent])
    vars.push(["--color-pmb-gold-600", readableInk(t.accent)])
  }

  return `:root{${vars.map(([name, value]) => `${name}:${value}`).join(";")}}`
}

export interface ThemeWarning {
  /** Campo de TEXTO a devolver para o automático para resolver o aviso. */
  fix: ThemeColorKey
  message: string
}

/**
 * Combinações que a pessoa não vai conseguir ler. Só acontecem com ajuste
 * manual — o automático nunca cai aqui. O painel mostra e oferece corrigir;
 * não bloqueia o salvamento.
 */
export function themeWarnings(source: ThemeSource): ThemeWarning[] {
  const t = resolveTheme(source)
  const checks: Array<[string, string, ThemeColorKey, string]> = [
    [t.btnOn, t.btn, "buttonText", "O texto dos botões comuns está difícil de ler."],
    [t.ctaOn, t.cta, "ctaText", "O texto dos botões de destaque está difícil de ler."],
    [t.ink, WHITE, "lightTitle", "Os títulos estão difíceis de ler sobre o fundo claro."],
    [t.darkOn, t.dark, "darkText", "O texto das áreas escuras está difícil de ler."],
  ]
  return checks
    .filter(([fg, bg]) => contrastRatio(fg, bg) < MIN_CONTRAST)
    .map(([, , fix, message]) => ({ fix, message }))
}

/**
 * Logo certa para o fundo. A unidade pode ter enviado só uma das duas: a área
 * cai na outra em vez de ficar sem marca. `plate` avisa quando a logo de fundo
 * CLARO vai sobre fundo ESCURO — aí ela precisa de uma placa branca por baixo
 * (o comportamento histórico do rodapé), senão some.
 */
export function logoForTone(
  tone: Tone,
  logos: { logoUrl?: string | null; logoDarkUrl?: string | null },
): { url: string | null; plate: boolean } {
  const light = logos.logoUrl ?? null
  const dark = logos.logoDarkUrl ?? null
  if (tone === "dark") return { url: dark ?? light, plate: !dark && Boolean(light) }
  return { url: light ?? dark, plate: false }
}
