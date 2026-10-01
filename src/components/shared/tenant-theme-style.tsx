import { tenantThemeCss, type ThemeSource } from "@/lib/tenant/theme"

/**
 * Aplica a identidade da unidade na página inteira (loja, login, checkout e
 * área do aluno). Não renderiza nada quando a unidade está no padrão da
 * plataforma. O CSS só contém hex validado — ver `safeHex`.
 */
export function TenantThemeStyle({ tenant }: { tenant: ThemeSource | null }) {
  const css = tenantThemeCss(tenant)
  if (!css) return null
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
