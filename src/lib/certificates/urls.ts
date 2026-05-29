import { vitrineDomain } from "@/lib/tenant/urls"

/**
 * URL publica de validacao do certificado (QR code + texto). Aponta para o
 * dominio da vitrine (livrecursos.com.br) com prefixo www, que serve a rota
 * /validar/[code] via proxy.
 *
 * Mora aqui (modulo leve, sem dependencias de PDF) para que paginas server
 * possam montar a URL sem importar `generate-pdf.ts` — esse arquivo puxa o
 * `@react-pdf/renderer` inteiro pro bundle, o que quebrava a tela de detalhe
 * do certificado na area do aluno.
 */
export function validationUrlFor(code: string): string {
  return `https://www.${vitrineDomain()}/validar/${code}`
}
