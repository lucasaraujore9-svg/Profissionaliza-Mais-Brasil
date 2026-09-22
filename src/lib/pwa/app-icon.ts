// Regra do icone do app instalado (PWA), pura e sem DOM — o compositor roda no
// browser (compose-app-icon.ts) e os testes rodam no node.
//
// Por que compor em vez de mandar a logo crua: o Android MASCARA o icone do
// atalho dentro de um circulo/squircle e pinta o vazio de branco. Uma logo clara
// em PNG transparente desaparece; uma logo escura sobre fundo escuro, idem. Por
// isso o fundo e o OPOSTO do brilho da imagem enviada.

export const APP_ICON_SIZE = 512
// Area segura do icone maskable: a plataforma pode recortar ate 20% de cada
// borda, entao o desenho ocupa 60% do lado e o resto e margem.
export const APP_ICON_CONTENT_RATIO = 0.6
export const APP_ICON_LIGHT_BG = "#FFFFFF"
export const APP_ICON_DARK_BG = "#0B1120"
// Acima disso a imagem conta como CLARA (luminancia relativa 0..1).
export const APP_ICON_LIGHT_THRESHOLD = 0.5
// Pixel quase transparente nao tem cor: conta-lo como preto inverteria o fundo
// de toda logo clara em PNG com fundo vazado — que e o caso comum.
export const APP_ICON_MIN_ALPHA = 32

/** Luminancia relativa (sRGB, aproximacao Rec. 709) de um pixel 0..255. */
export function pixelLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Luminancia media dos pixels VISIVEIS de um buffer RGBA.
 * `null` quando a imagem e inteiramente transparente — nao ha do que deduzir
 * brilho, e o chamador cai no fundo claro.
 */
export function averageVisibleLuminance(
  data: ArrayLike<number>,
): number | null {
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < APP_ICON_MIN_ALPHA) continue
    sum += pixelLuminance(data[i], data[i + 1], data[i + 2])
    count++
  }
  return count === 0 ? null : sum / count
}

/** Logo clara -> fundo escuro; logo escura (ou indefinida) -> fundo claro. */
export function backgroundForLuminance(luminance: number | null): string {
  if (luminance === null) return APP_ICON_LIGHT_BG
  return luminance > APP_ICON_LIGHT_THRESHOLD
    ? APP_ICON_DARK_BG
    : APP_ICON_LIGHT_BG
}
