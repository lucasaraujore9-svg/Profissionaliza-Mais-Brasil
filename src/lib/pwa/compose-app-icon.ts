// Compositor do icone do app — roda no BROWSER, no ato do upload.
//
// Fica no client de proposito: o servidor nao tem lib de imagem e o upload ja
// valida magic bytes do que chega. Aqui a unidade ve o resultado antes de salvar,
// e o arquivo gravado ja e o icone final (quadrado, com fundo), entao nenhuma
// leitura posterior precisa saber a regra.

import {
  APP_ICON_CONTENT_RATIO,
  APP_ICON_SIZE,
  averageVisibleLuminance,
  backgroundForLuminance,
} from "./app-icon"

const SAMPLE_SIZE = 64

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("Não foi possível processar a imagem neste navegador")
  return ctx
}

function canvasOf(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  return canvas
}

/**
 * Le a imagem enviada, mede o brilho dela e devolve um PNG 512×512 com a logo
 * centralizada sobre o fundo oposto (clara -> escuro, escura -> claro).
 */
export async function composeAppIcon(
  file: File,
): Promise<{ file: File; background: string }> {
  const bitmap = await createImageBitmap(file)
  try {
    // 1. Brilho: desenha reduzido so para amostrar — 64×64 basta e evita ler
    //    megapixels de uma logo grande.
    const sample = canvasOf(SAMPLE_SIZE)
    const sampleCtx = context(sample)
    sampleCtx.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    const { data } = sampleCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    const background = backgroundForLuminance(averageVisibleLuminance(data))

    // 2. Icone final: fundo cheio + logo contida na area segura do maskable.
    const out = canvasOf(APP_ICON_SIZE)
    const ctx = context(out)
    ctx.fillStyle = background
    ctx.fillRect(0, 0, APP_ICON_SIZE, APP_ICON_SIZE)

    const box = APP_ICON_SIZE * APP_ICON_CONTENT_RATIO
    const scale = Math.min(box / bitmap.width, box / bitmap.height)
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    ctx.drawImage(bitmap, (APP_ICON_SIZE - w) / 2, (APP_ICON_SIZE - h) / 2, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob(resolve, "image/png"),
    )
    if (!blob) throw new Error("Falha ao gerar o ícone do app")

    return {
      file: new File([blob], "app-icon.png", { type: "image/png" }),
      background,
    }
  } finally {
    bitmap.close()
  }
}
