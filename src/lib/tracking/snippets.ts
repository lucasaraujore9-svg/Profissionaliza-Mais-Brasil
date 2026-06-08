import type { TrackingPixels } from "./schema"

/**
 * Monta os snippets dos pixels a partir de uma config validada. NUNCA recebe
 * HTML/script do usuário — só IDs já validados por regex em schema.ts. Ainda
 * assim sanitiza cada ID (defesa em profundidade) antes de interpolar no JS.
 *
 * Dois grupos:
 *  - baseScripts(): carregam o pixel (PageView) em todas as páginas.
 *  - buildPurchaseInlineScript(): dispara a conversão de compra (valor + moeda
 *    + transaction_id) na página de confirmação, com dedupe por sessionStorage.
 */

export interface PixelScript {
  /** Chave única (id do <Script> do next/script). */
  id: string
  /** Script externo. */
  src?: string
  /** JS inline (injetado via dangerouslySetInnerHTML). */
  inline?: string
  strategy?: "afterInteractive" | "lazyOnload"
}

export interface PurchasePayload {
  value: number
  currency: string
  transactionId: string
  contentName: string
}

/** Remove tudo que não seja seguro num literal JS/URL. IDs já passaram por Zod. */
function sanitizeId(value: string | undefined | null): string {
  if (!value) return ""
  return value.replace(/[^A-Za-z0-9_-]/g, "")
}

/** Embute um valor como literal JSON seguro dentro de um <script> inline. */
function j(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

const GTAG_SRC = "https://www.googletagmanager.com/gtag/js"

/**
 * Scripts base (loaders). Google products (GA4 + Ads) compartilham o gtag.js:
 * carregamos uma vez e damos config() em cada ID.
 */
export function baseScripts(pixels: TrackingPixels): PixelScript[] {
  const scripts: PixelScript[] = []
  if (!pixels) return scripts

  // --- Google gtag (GA4 + Google Ads) ---
  const ga4Id = pixels.ga4?.enabled !== false ? sanitizeId(pixels.ga4?.measurementId) : ""
  const adsId =
    pixels.googleAds?.enabled !== false ? sanitizeId(pixels.googleAds?.conversionId) : ""
  const gtagIds = [ga4Id, adsId].filter(Boolean)
  if (gtagIds.length > 0) {
    scripts.push({
      id: "pmb-gtag-src",
      src: `${GTAG_SRC}?id=${encodeURIComponent(gtagIds[0])}`,
      strategy: "afterInteractive",
    })
    const configLines = gtagIds.map((id) => `gtag('config', ${j(id)});`).join("\n  ")
    scripts.push({
      id: "pmb-gtag-init",
      strategy: "afterInteractive",
      inline: `window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  ${configLines}`,
    })
  }

  // --- Google Tag Manager ---
  const gtmId = pixels.gtm?.enabled !== false ? sanitizeId(pixels.gtm?.containerId) : ""
  if (gtmId) {
    scripts.push({
      id: "pmb-gtm",
      strategy: "afterInteractive",
      inline: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${j(gtmId)});`,
    })
  }

  // --- Meta (Facebook) Pixel ---
  const metaId = pixels.metaPixel?.enabled !== false ? sanitizeId(pixels.metaPixel?.pixelId) : ""
  if (metaId) {
    scripts.push({
      id: "pmb-meta-pixel",
      strategy: "afterInteractive",
      inline: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', ${j(metaId)});
  fbq('track', 'PageView');`,
    })
  }

  // --- TikTok Pixel ---
  const tiktokId = pixels.tiktok?.enabled !== false ? sanitizeId(pixels.tiktok?.pixelId) : ""
  if (tiktokId) {
    scripts.push({
      id: "pmb-tiktok",
      strategy: "afterInteractive",
      inline: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${j(tiktokId)});ttq.page();}(window,document,'ttq');`,
    })
  }

  // --- LinkedIn Insight Tag ---
  const liId = pixels.linkedin?.enabled !== false ? sanitizeId(pixels.linkedin?.partnerId) : ""
  if (liId) {
    scripts.push({
      id: "pmb-linkedin",
      strategy: "afterInteractive",
      inline: `_linkedin_partner_id = ${j(liId)};
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  window._linkedin_data_partner_ids.push(_linkedin_partner_id);
  (function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`,
    })
  }

  // --- Pinterest Tag ---
  const pinId = pixels.pinterest?.enabled !== false ? sanitizeId(pixels.pinterest?.tagId) : ""
  if (pinId) {
    scripts.push({
      id: "pmb-pinterest",
      strategy: "afterInteractive",
      inline: `!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
  pintrk('load', ${j(pinId)});
  pintrk('page');`,
    })
  }

  // --- Microsoft Advertising (Bing) UET ---
  const uetId =
    pixels.microsoftUet?.enabled !== false ? sanitizeId(pixels.microsoftUet?.tagId) : ""
  if (uetId) {
    scripts.push({
      id: "pmb-msuet",
      strategy: "afterInteractive",
      inline: `(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:${j(uetId)},enableAutoSpaTracking:true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");`,
    })
  }

  // --- Microsoft Clarity (heatmap) ---
  const clarityId =
    pixels.clarity?.enabled !== false ? sanitizeId(pixels.clarity?.projectId) : ""
  if (clarityId) {
    scripts.push({
      id: "pmb-clarity",
      strategy: "afterInteractive",
      inline: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${j(clarityId)});`,
    })
  }

  // --- Hotjar (heatmap) ---
  const hotjarId = pixels.hotjar?.enabled !== false ? sanitizeId(pixels.hotjar?.siteId) : ""
  if (hotjarId) {
    scripts.push({
      id: "pmb-hotjar",
      strategy: "afterInteractive",
      inline: `(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${j(Number(hotjarId))},hjsv:6};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`,
    })
  }

  return scripts
}

/**
 * Monta o JS inline que dispara as conversões de compra em todos os pixels que
 * suportam (GA4, Google Ads, Meta, TikTok, Pinterest, Microsoft UET). Cada
 * disparo é defensivo (checa se a função global existe) e o bloco inteiro é
 * deduplicado por transactionId em sessionStorage para não contar 2x em refresh.
 * Clarity/Hotjar são gravação de sessão — sem evento de compra.
 *
 * Retorna null se nenhum provedor de conversão estiver habilitado.
 */
export function buildPurchaseInlineScript(
  pixels: TrackingPixels,
  purchase: PurchasePayload,
): string | null {
  if (!pixels) return null

  const value = Number.isFinite(purchase.value) ? purchase.value : 0
  const currency = /^[A-Z]{3}$/.test(purchase.currency) ? purchase.currency : "BRL"
  const txn = sanitizeId(purchase.transactionId) || "pmb"
  const name = purchase.contentName

  const events: string[] = []

  if (pixels.ga4?.enabled !== false && sanitizeId(pixels.ga4?.measurementId)) {
    events.push(
      `if(typeof gtag==='function'){gtag('event','purchase',{transaction_id:${j(txn)},value:${j(value)},currency:${j(currency)},items:[{item_name:${j(name)}}]});}`,
    )
  }

  const adsId = sanitizeId(pixels.googleAds?.conversionId)
  const adsLabel = sanitizeId(pixels.googleAds?.purchaseLabel)
  if (pixels.googleAds?.enabled !== false && adsId && adsLabel) {
    events.push(
      `if(typeof gtag==='function'){gtag('event','conversion',{send_to:${j(`${adsId}/${adsLabel}`)},value:${j(value)},currency:${j(currency)},transaction_id:${j(txn)}});}`,
    )
  }

  if (pixels.metaPixel?.enabled !== false && sanitizeId(pixels.metaPixel?.pixelId)) {
    events.push(
      `if(typeof fbq==='function'){fbq('track','Purchase',{value:${j(value)},currency:${j(currency)},content_name:${j(name)}});}`,
    )
  }

  if (pixels.tiktok?.enabled !== false && sanitizeId(pixels.tiktok?.pixelId)) {
    events.push(
      `if(window.ttq&&typeof window.ttq.track==='function'){window.ttq.track('CompletePayment',{value:${j(value)},currency:${j(currency)},content_name:${j(name)}});}`,
    )
  }

  if (pixels.pinterest?.enabled !== false && sanitizeId(pixels.pinterest?.tagId)) {
    events.push(
      `if(typeof pintrk==='function'){pintrk('track','checkout',{value:${j(value)},order_quantity:1,currency:${j(currency)}});}`,
    )
  }

  if (pixels.microsoftUet?.enabled !== false && sanitizeId(pixels.microsoftUet?.tagId)) {
    events.push(
      `if(window.uetq){window.uetq.push('event','purchase',{revenue_value:${j(value)},currency:${j(currency)}});}`,
    )
  }

  if (events.length === 0) return null

  const dedupeKey = `pmb_purchase_${txn}`
  return `(function(){try{var k=${j(dedupeKey)};if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');}catch(e){}
  try{${events.join("\n  ")}}catch(e){}
})();`
}
