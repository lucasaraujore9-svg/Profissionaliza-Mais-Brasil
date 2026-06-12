import { signOut } from "next-auth/react"

/**
 * Logout que SEMPRE retorna para o /login do DOMÍNIO ATUAL (revenda, admin ou
 * PMB).
 *
 * Não delegamos o redirect ao NextAuth (`signOut({ callbackUrl: "/login" })`)
 * porque a resolução de `baseUrl` do callback `redirect` usa NEXTAUTH_URL /
 * AUTH_URL — que aponta para o domínio mãe (profissionalizamaisbrasil.com.br).
 * Isso jogava o revendedor para o login do SISTEMA MÃE ao sair do painel da
 * própria unidade, em vez de voltar para o login do domínio dele.
 *
 * Com `redirect: false`, o cookie de sessão é limpo na origem atual e nós
 * mesmos navegamos via `window.location`, que resolve relativo à origem atual —
 * mantendo o usuário no domínio onde ele está.
 */
export async function signOutToLogin(): Promise<void> {
  await signOut({ redirect: false })
  window.location.href = "/login"
}
