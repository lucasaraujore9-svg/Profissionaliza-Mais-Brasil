"use client"

/**
 * Permissões efetivas disponíveis para o client.
 *
 * Existe para a UI parar de mostrar o que a API vai recusar. Antes, dezenas de
 * telas abriam com a permissão de LEITURA e desenhavam os botões de escrita
 * assim mesmo — a pessoa clicava em "Novo cupom" e só descobria o 403 depois.
 * Threading de `canEdit` por prop resolve caso a caso, mas morre em componente
 * aninhado; este contexto entrega o mesmo conjunto que o guard usa no servidor.
 *
 * NÃO é controle de acesso: é apresentação. Quem autoriza continua sendo
 * `requireAdmin`/`requirePainel` na rota — esconder o botão só evita o beco sem
 * saída. Toda escrita que some daqui tem que estar fechada lá também.
 *
 * O conjunto vem do layout, que já o resolve server-side por request
 * (`adminContext()` / `painelContext()`) e o repassa ao shell.
 */

import { createContext, useContext, useMemo } from "react"
import type { AdminPermission } from "@/lib/auth/admin-permissions"
import type { PainelPermission } from "@/lib/auth/painel-permissions"

/** União dos dois catálogos: o provedor é o mesmo nos dois painéis. */
export type AnyPermission = AdminPermission | PainelPermission

const PermissionContext = createContext<ReadonlySet<AnyPermission> | null>(null)

export function PermissionProvider({
  permissions,
  children,
}: {
  permissions: readonly AnyPermission[]
  children: React.ReactNode
}) {
  const value = useMemo(
    () => new Set<AnyPermission>(permissions),
    [permissions],
  )
  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  )
}

/**
 * `can("catalogo.manage")` dentro de qualquer client component do /admin ou do
 * /painel.
 *
 * Fora do provedor devolve sempre `false` — fail-closed. Um componente
 * renderizado por engano fora da árvore do layout esconde a ação em vez de
 * liberá-la; o oposto reintroduziria exatamente o botão-que-dá-403.
 */
export function usePermissions(): {
  can: (perm: AnyPermission) => boolean
  canAny: (...perms: AnyPermission[]) => boolean
  /** true quando não há provedor na árvore (útil em teste e Storybook). */
  unavailable: boolean
} {
  const set = useContext(PermissionContext)
  return useMemo(
    () => ({
      can: (perm: AnyPermission) => set?.has(perm) ?? false,
      canAny: (...perms: AnyPermission[]) =>
        perms.some((perm) => set?.has(perm) ?? false),
      unavailable: set === null,
    }),
    [set],
  )
}

/** Açúcar para o caso mais comum: uma única permissão. */
export function useCan(perm: AnyPermission): boolean {
  return usePermissions().can(perm)
}

/**
 * Renderiza os filhos só quem tem a permissão.
 *
 *   <Can perm="cupons.manage"><Button>Novo cupom</Button></Can>
 *
 * `fallback` cobre o caso em que a ausência precisa dizer algo (um aviso de
 * somente-leitura, por exemplo) em vez de simplesmente sumir.
 */
export function Can({
  perm,
  fallback = null,
  children,
}: {
  perm: AnyPermission
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  return useCan(perm) ? <>{children}</> : <>{fallback}</>
}

/**
 * Modo somente-leitura para uma TELA inteira de formulário.
 *
 * Quem tem a permissão vê a tela normal. Quem não tem vê o mesmo conteúdo
 * dentro de um `<fieldset disabled>` — que desabilita nativamente todo
 * `input`/`select`/`textarea`/`button` aninhado, em qualquer profundidade, sem
 * precisar tocar em cada campo. É o que torna viável abrir dezenas de telas de
 * configuração para consulta sem reescrevê-las uma a uma.
 *
 * Limite conhecido: `<fieldset disabled>` não neutraliza `<a>` nem handler de
 * clique preso a uma `div`. Onde a ação de escrita for um link ou um elemento
 * não-form, gateie explicitamente com <Can>. A autorização de verdade continua
 * na rota; isto evita o beco sem saída, não substitui o guard.
 */
export function WriteGate({
  perm,
  children,
  notice = "Você está vendo esta tela em modo somente leitura.",
}: {
  /**
   * Uma permissão, ou uma LISTA quando a tela reúne áreas com permissões de
   * escrita diferentes — nesse caso basta ter UMA para sair do somente-leitura,
   * e o gate fino de cada bloco continua sendo responsabilidade da tela. Exigir
   * todas trancaria quem legitimamente edita só metade da página.
   */
  perm: AnyPermission | readonly AnyPermission[]
  children: React.ReactNode
  notice?: string
}) {
  const { canAny } = usePermissions()
  const allowed = canAny(...(Array.isArray(perm) ? perm : [perm as AnyPermission]))
  if (allowed) return <>{children}</>
  return (
    <div className="space-y-4">
      <p
        role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        {notice}
      </p>
      {/* `min-w-0` porque fieldset tem largura mínima intrínseca e quebraria
          grids/flex das telas envolvidas. */}
      <fieldset disabled className="min-w-0 border-0 p-0 opacity-90">
        {children}
      </fieldset>
    </div>
  )
}
