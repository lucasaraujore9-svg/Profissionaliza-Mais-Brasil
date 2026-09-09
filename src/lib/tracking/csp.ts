import type { TrackingProviderKey } from "./schema"

/**
 * Origens de terceiros que cada pixel precisa alcançar, por diretiva de CSP.
 *
 * Por que este arquivo existe: os snippets de `snippets.ts` baixam o loader de
 * um domínio externo e mandam os eventos para outros. A CSP montada em
 * `next.config.ts` bloqueia tudo o que não estiver listado — e o bloqueio é
 * SILENCIOSO para quem configurou: o ID fica salvo, o painel continua dizendo
 * que o pixel está instalado e nenhum evento chega ao gerenciador de anúncios.
 * Foi assim que o pixel da Meta ficou morto nas vitrines das revendas.
 *
 * Por isso a lista mora ao LADO dos snippets, e não dentro do next.config.ts:
 * quem adicionar um provedor tropeça nela no mesmo diretório. O
 * `Record<TrackingProviderKey, ...>` faz o compilador exigir uma entrada por
 * provedor do schema, e `csp.test.ts` exige que todo host carregado pelos
 * snippets esteja coberto por uma origem de `script`.
 *
 * LIMITE CONHECIDO: o teste só alcança os LOADERS — as URLs literais que estão
 * no nosso código. Os endpoints de EVENTO vivem dentro da lib de cada
 * fornecedor, então `connect`/`img`/`frame` vêm da documentação de CSP de cada
 * um e só se confirmam olhando a tela do fornecedor depois do deploy.
 */

export interface ProviderOrigins {
  /** script-src — de onde o loader e os módulos do pixel são baixados. */
  script?: readonly string[]
  /** connect-src — fetch/XHR/sendBeacon/WebSocket que levam os eventos. */
  connect?: readonly string[]
  /** img-src — beacon via <img> 1x1, fallback usado por quase todos. */
  img?: readonly string[]
  /** frame-src — iframe oculto (remarketing do Google, widget do Hotjar). */
  frame?: readonly string[]
  /** font-src — fonte própria do widget (só o Hotjar precisa). */
  font?: readonly string[]
}

/** Domínio comum às três tags do Google (gtag.js do GA4/Ads e o gtm.js). */
const GOOGLE_TAG = "https://www.googletagmanager.com"
/** Coleta do GA4, compartilhada por GA4 e GTM (que quase sempre carrega o GA4). */
const GOOGLE_ANALYTICS_COLLECT = [
  GOOGLE_TAG,
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
] as const

export const TRACKING_CSP: Record<TrackingProviderKey, ProviderOrigins> = {
  // --- Google Analytics 4 (gtag.js) ---
  ga4: {
    script: [GOOGLE_TAG],
    connect: GOOGLE_ANALYTICS_COLLECT,
    img: [GOOGLE_TAG, "https://*.google-analytics.com"],
  },

  // --- Google Ads ---
  // O ping de conversão sai no domínio de PESQUISA do país, não num domínio
  // "de API": por isso www.google.com.br entra junto — sem ele a conversão do
  // público brasileiro é bloqueada mesmo com www.google.com liberado.
  // O frame em td.doubleclick.net é o que alimenta as listas de remarketing;
  // sem ele a conversão funciona e o público não enche.
  googleAds: {
    script: [
      GOOGLE_TAG,
      "https://www.googleadservices.com",
      "https://googleads.g.doubleclick.net",
    ],
    connect: [
      "https://www.google.com",
      "https://www.google.com.br",
      "https://googleads.g.doubleclick.net",
      "https://td.doubleclick.net",
      "https://stats.g.doubleclick.net",
    ],
    img: [
      "https://www.google.com",
      "https://www.google.com.br",
      "https://googleads.g.doubleclick.net",
      "https://stats.g.doubleclick.net",
    ],
    frame: ["https://td.doubleclick.net", GOOGLE_TAG],
  },

  // --- Google Tag Manager ---
  // ATENÇÃO: o GTM é um CONTÊINER — quem edita o container lá fora decide que
  // tags carregar. Liberar o gtm.js aqui NÃO libera as tags que ele injetar; um
  // provedor novo adicionado dentro do GTM cai na mesma CSP e é bloqueado do
  // mesmo jeito, sem passar por este arquivo.
  gtm: {
    script: [GOOGLE_TAG],
    connect: GOOGLE_ANALYTICS_COLLECT,
    img: [GOOGLE_TAG, "https://*.google-analytics.com"],
  },

  // --- Meta (Facebook/Instagram) Pixel ---
  // Precisa das três diretivas: liberar só o script faz o pixel carregar e não
  // reportar nada. O img-src cobre o fallback do <img> 1x1 do fbevents.
  metaPixel: {
    script: ["https://connect.facebook.net"],
    connect: ["https://www.facebook.com", "https://connect.facebook.net"],
    img: ["https://www.facebook.com"],
  },

  // --- TikTok Pixel ---
  tiktok: {
    script: ["https://analytics.tiktok.com"],
    // Curinga porque o advanced matching do TikTok fala com mssdk-*.tiktok.com,
    // um host que muda por região e não está no nosso código.
    connect: ["https://*.tiktok.com"],
    img: ["https://analytics.tiktok.com"],
  },

  // --- LinkedIn Insight Tag ---
  linkedin: {
    script: ["https://snap.licdn.com"],
    connect: ["https://px.ads.linkedin.com"],
    img: ["https://px.ads.linkedin.com", "https://p.adsymptotic.com"],
  },

  // --- Pinterest Tag ---
  pinterest: {
    script: ["https://s.pinimg.com"],
    connect: ["https://ct.pinterest.com"],
    img: ["https://ct.pinterest.com", "https://s.pinimg.com"],
  },

  // --- Microsoft Advertising (Bing) UET ---
  microsoftUet: {
    script: ["https://bat.bing.com"],
    connect: ["https://bat.bing.com"],
    img: ["https://bat.bing.com"],
  },

  // --- Microsoft Clarity (heatmap/gravação) ---
  // Curinga: a gravação sobe para um host regional (x.clarity.ms, e.clarity.ms...)
  // escolhido em runtime. c.bing.com é a ponte com o UET quando os dois convivem.
  clarity: {
    script: ["https://*.clarity.ms"],
    connect: ["https://*.clarity.ms", "https://c.bing.com"],
    img: ["https://*.clarity.ms", "https://c.bing.com"],
  },

  // --- Hotjar (heatmap/gravação) ---
  // Único provedor que precisa de font-src e frame-src: o widget de pesquisa
  // roda em iframe e traz a fonte dele. A gravação usa WebSocket — daí o
  // esquema wss://, que 'self' e https:// não cobrem.
  hotjar: {
    script: ["https://*.hotjar.com"],
    connect: ["https://*.hotjar.com", "https://*.hotjar.io", "wss://*.hotjar.com"],
    img: ["https://*.hotjar.com"],
    frame: ["https://*.hotjar.com"],
    font: ["https://*.hotjar.com"],
  },
}

/**
 * Junta as origens de todos os provedores numa diretiva. Uma diretiva de CSP
 * repetida no header é IGNORADA (vale a primeira), então tudo precisa sair numa
 * lista só. Ordenado para o header ser estável entre builds e legível no diff.
 */
export function trackingOrigins(directive: keyof ProviderOrigins): string[] {
  const out = new Set<string>()
  for (const provider of Object.values(TRACKING_CSP)) {
    for (const origin of provider[directive] ?? []) out.add(origin)
  }
  return [...out].sort()
}
