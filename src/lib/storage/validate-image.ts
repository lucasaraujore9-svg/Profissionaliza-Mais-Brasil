/**
 * Valida que o buffer começa com a magic signature do MIME declarado.
 *
 * Defesa contra MIME spoofing — o cliente pode enviar `Content-Type: image/png`
 * com payload arbitrário (executável, HTML, SVG). Aqui conferimos os primeiros
 * bytes contra a assinatura conhecida do formato.
 *
 * Retorna `true` se o buffer começa com a assinatura esperada do mime.
 */
export function isValidImageMagic(
  buffer: ArrayBuffer | Buffer,
  declaredMime: string,
): boolean {
  const bytes = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength)))
  if (bytes.length < 4) return false

  switch (declaredMime) {
    case "image/png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      )
    case "image/jpeg":
    case "image/jpg":
      // FF D8 FF
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case "image/webp":
      // "RIFF" .... "WEBP"
      if (bytes.length < 12) return false
      return (
        bytes[0] === 0x52 && // R
        bytes[1] === 0x49 && // I
        bytes[2] === 0x46 && // F
        bytes[3] === 0x46 && // F
        bytes[8] === 0x57 && // W
        bytes[9] === 0x45 && // E
        bytes[10] === 0x42 && // B
        bytes[11] === 0x50 //   P
      )
    case "image/gif":
      // "GIF8"
      return (
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38
      )
    default:
      return false
  }
}
