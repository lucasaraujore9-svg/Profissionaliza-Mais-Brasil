// Decide se uma imagem deve PULAR o otimizador do Next/Vercel (`unoptimized`).
//
// Capas de curso vêm da plataforma parceira (playcurso.com) — um origin de
// terceiro que não controlamos e que, sob carga (uma grade com dezenas de
// capas), fica lento ou limita as conexões. Quando o otimizador da Vercel
// busca essas imagens server-side e o origin trava, a otimização FALHA de forma
// dura (imagem quebrada) e ainda congestiona o otimizador — chegando a derrubar
// imagens confiáveis (a logo do Supabase) renderizadas na mesma página.
//
// Servindo essas imagens direto (`unoptimized`), o navegador as carrega de forma
// lazy e distribuída entre os clientes, com cache próprio e degradação suave.
//
// Mantemos a otimização para imagens no nosso Supabase Storage (logos, banners e
// uploads das revendas) e para assets locais — origens confiáveis e no allowlist.
export function shouldUnoptimizeImage(url: string | null | undefined): boolean {
  if (!url) return false
  // data:, blob: e caminhos locais (/images/...) seguem o fluxo padrão (otimizado).
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false
  try {
    const host = new URL(url).hostname
    return !host.endsWith(".supabase.co")
  } catch {
    return false
  }
}
