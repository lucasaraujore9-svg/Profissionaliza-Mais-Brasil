/**
 * Papéis e permissões da equipe de uma unidade (revenda).
 *
 * FONTE ÚNICA DE VERDADE — o menu (`sidebar-painel.tsx`), os guards de rota
 * (`painel-guard.ts`), as abas de relatório (`lib/reports/painel/tabs.ts`), o
 * roteamento de notificações e a tela `/painel/equipe` derivam TODOS deste
 * arquivo. Não replicar a matriz em outro lugar.
 *
 * Modelo: cada membro tem um PAPEL (preset) e, opcionalmente, ajustes finos por
 * pessoa (`extraPermissions` / `revokedPermissions` em TenantMember). O dono da
 * unidade (`User.tenantId` apontando para o tenant) não tem TenantMember e
 * sempre recebe o preset "owner" — todas as permissões.
 */

export const PAINEL_MEMBER_ROLES = [
  "owner",
  "manager",
  "consultant",
  "support",
  "finance",
] as const

export type PainelMemberRole = (typeof PAINEL_MEMBER_ROLES)[number]

/** Papéis atribuíveis pelo dono em /painel/equipe (owner não é atribuível). */
export const ASSIGNABLE_MEMBER_ROLES = [
  "manager",
  "consultant",
  "support",
  "finance",
] as const satisfies readonly PainelMemberRole[]

export type AssignableMemberRole = (typeof ASSIGNABLE_MEMBER_ROLES)[number]

/**
 * Catálogo fechado de permissões. Convenção do sufixo:
 *   `.view`   — leitura da área
 *   `.viewAll`— vê os dados da unidade inteira (sem ele, só o que a pessoa originou)
 *   demais    — ação de escrita
 * O modo somente-leitura da prévia ("ver como") depende dessa convenção; ver
 * READ_ONLY_SUFFIXES abaixo.
 */
export const PAINEL_PERMISSIONS = [
  "dashboard.view",

  // Auto-serviço: os próprios nome/e-mail/CPF e a própria senha. Está em TODOS
  // os presets — ninguém pode ficar sem trocar a própria senha. Não dá acesso a
  // nada da unidade (isso é `configuracoes.manage`).
  "perfil.edit",

  "alunos.view",
  "alunos.viewAll",
  "alunos.manage",
  "alunos.impersonate",

  "vendas.view",
  "vendas.viewAll",
  "vendas.create",

  "leads.view",
  "leads.viewAll",
  "leads.config",

  "catalogo.view",
  "catalogo.manage",
  "pacotes.manage",

  "cupons.view",
  "cupons.manage",

  "financeiro.view",
  "financeiro.export",

  // Mensalidade que a UNIDADE paga para a PMB (/painel/cobrancas) — não
  // confundir com "financeiro", que é o dinheiro que entra das vendas. Fora de
  // todos os presets: é do dono, e ele concede ao Financeiro se quiser.
  "cobrancas.view",

  "certificados.view",
  "certificados.manage",
  "certificados.template",

  "atendimento.manage",
  "comunicacao.manage",

  "relatorios.view",
  "relatorios.financeiro",
  "relatorios.indicacoes",

  "indicacoes.view",
  "indicacoes.sacar",

  "vitrine.manage",
  "dominio.manage",
  "automacao.manage",
  "revendas.manage",

  "treinamentos.view",
  "artes.view",

  "equipe.manage",
  "configuracoes.manage",
  "gateway.manage",
  "conta.delete",
] as const

export type PainelPermission = (typeof PAINEL_PERMISSIONS)[number]

const ALL: readonly PainelPermission[] = PAINEL_PERMISSIONS

/**
 * Nunca concedíveis por override. `equipe.manage` deixaria um membro criar
 * outros membros e escalar o próprio privilégio; `conta.delete` destrói a
 * unidade. Ambas ficam exclusivas do dono.
 */
export const OWNER_EXCLUSIVE = ["equipe.manage", "conta.delete"] as const

/** Concedíveis por override, mas com aviso destacado na UI de Equipe. */
export const SENSITIVE = [
  "gateway.manage",
  "dominio.manage",
  "indicacoes.view",
  "indicacoes.sacar",
  "cobrancas.view",
  "alunos.impersonate",
  "configuracoes.manage",
] as const

const OWNER_EXCLUSIVE_SET = new Set<string>(OWNER_EXCLUSIVE)

/**
 * Sufixos que caracterizam escrita. A prévia "ver como" remove toda permissão
 * terminada em um destes, garantindo que a simulação nunca altere o banco.
 */
const READ_ONLY_SUFFIXES = [
  ".manage",
  ".create",
  ".delete",
  ".sacar",
  ".config",
  ".template",
  ".impersonate",
  ".export",
] as const

export function isWritePermission(perm: PainelPermission): boolean {
  return READ_ONLY_SUFFIXES.some((suffix) => perm.endsWith(suffix))
}

/**
 * Presets por papel.
 *
 * A ausência de `*.viewAll` é o que produz o escopo "só o que é dele": sem ela,
 * as queries filtram por `soldByUserId` / `ownerUserId` (ver `painel-guard.ts`).
 */
export const ROLE_PRESETS: Record<PainelMemberRole, readonly PainelPermission[]> = {
  // Dono da unidade: tudo.
  owner: ALL,

  // Braço direito do dono. Opera a unidade inteira, mas não toca no que é
  // patrimônio/identidade do negócio: credenciais de gateway, domínio, equipe,
  // comissões de indicação e exclusão da conta.
  manager: [
    "dashboard.view",
    "perfil.edit",
    "alunos.view",
    "alunos.viewAll",
    "alunos.manage",
    "vendas.view",
    "vendas.viewAll",
    "vendas.create",
    "leads.view",
    "leads.viewAll",
    "leads.config",
    "catalogo.view",
    "catalogo.manage",
    "pacotes.manage",
    "cupons.view",
    "cupons.manage",
    "financeiro.view",
    "financeiro.export",
    "certificados.view",
    "certificados.manage",
    "certificados.template",
    "atendimento.manage",
    "comunicacao.manage",
    "relatorios.view",
    "relatorios.financeiro",
    "vitrine.manage",
    "automacao.manage",
    "treinamentos.view",
    "artes.view",
  ],

  // Vendedor / consultor: vende e cuida da própria carteira. Sem nenhum
  // `*.viewAll` — enxerga apenas os leads atribuídos a ele e os alunos/vendas
  // que ele mesmo originou.
  consultant: [
    "dashboard.view",
    "perfil.edit",
    "alunos.view",
    "alunos.manage",
    "vendas.view",
    "vendas.create",
    "leads.view",
    "catalogo.view",
    "cupons.view",
    "treinamentos.view",
    "artes.view",
  ],

  // Secretaria / atendimento: cuida do aluno depois da venda. Vê todos os
  // alunos da unidade, mas nada de dinheiro (preço, financeiro, vendas).
  support: [
    "dashboard.view",
    "perfil.edit",
    "alunos.view",
    "alunos.viewAll",
    "alunos.manage",
    "atendimento.manage",
    "comunicacao.manage",
    "certificados.view",
    "certificados.manage",
    "catalogo.view",
    "treinamentos.view",
    "artes.view",
  ],

  // Financeiro: dinheiro e relatórios. Leitura ampla de alunos/vendas para
  // conciliar, sem poder editar catálogo, vitrine ou domínio.
  finance: [
    "dashboard.view",
    "perfil.edit",
    "alunos.view",
    "alunos.viewAll",
    "vendas.view",
    "vendas.viewAll",
    "financeiro.view",
    "financeiro.export",
    "cupons.view",
    "cupons.manage",
    "relatorios.view",
    "relatorios.financeiro",
    "catalogo.view",
    "treinamentos.view",
  ],
}

const ROLE_LABELS: Record<PainelMemberRole, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  consultant: "Vendedor",
  support: "Secretaria",
  finance: "Financeiro",
}

const ROLE_DESCRIPTIONS: Record<PainelMemberRole, string> = {
  owner: "Acesso total à unidade.",
  manager:
    "Opera a unidade inteira: alunos, vendas, catálogo, cupons, financeiro, vitrine e atendimento. Não acessa gateway de pagamento, domínio, equipe nem indicações.",
  consultant:
    "Vende e acompanha a própria carteira. Vê apenas os leads atribuídos a ele e os alunos/vendas que ele originou.",
  support:
    "Cuida do aluno depois da venda: cadastro, certificados, atendimento e comunicação. Sem acesso a preço ou financeiro.",
  finance:
    "Financeiro e relatórios da unidade, com leitura de alunos e vendas para conciliação.",
}

export function roleLabel(role: PainelMemberRole | string | null): string {
  if (role && role in ROLE_LABELS) return ROLE_LABELS[role as PainelMemberRole]
  return ROLE_LABELS.consultant
}

export function roleDescription(role: PainelMemberRole): string {
  return ROLE_DESCRIPTIONS[role]
}

/**
 * Normaliza o `TenantMember.role` cru do banco. Valores legados/desconhecidos
 * ("viewer", string vazia, papel removido numa versão futura) caem no preset
 * MAIS RESTRITO (consultant) — fail-closed, nunca fail-open.
 */
export function normalizeMemberRole(raw: string | null | undefined): PainelMemberRole {
  if (raw && (PAINEL_MEMBER_ROLES as readonly string[]).includes(raw)) {
    return raw as PainelMemberRole
  }
  return "consultant"
}

export function isPainelPermission(value: string): value is PainelPermission {
  return (PAINEL_PERMISSIONS as readonly string[]).includes(value)
}

/**
 * Permissões efetivas de um membro: preset(papel) ∪ extra − revoked.
 *
 * - `extra` nunca pode conceder OWNER_EXCLUSIVE (defesa em profundidade: a API
 *   de Equipe também rejeita, mas se uma linha corrompida chegar do banco ela é
 *   ignorada aqui).
 * - O dono ignora `revoked` — não faz sentido o dono se auto-trancar fora da
 *   própria unidade, e isso evita um estado sem ninguém capaz de gerir a equipe.
 * - Entradas fora do catálogo são descartadas silenciosamente.
 */
export function resolvePermissions(
  role: PainelMemberRole,
  extra: readonly string[] = [],
  revoked: readonly string[] = [],
): Set<PainelPermission> {
  const result = new Set<PainelPermission>(ROLE_PRESETS[role])

  for (const perm of extra) {
    if (!isPainelPermission(perm)) continue
    if (OWNER_EXCLUSIVE_SET.has(perm)) continue
    result.add(perm)
  }

  if (role === "owner") return result

  for (const perm of revoked) {
    if (!isPainelPermission(perm)) continue
    result.delete(perm)
  }

  return result
}

/** Remove toda permissão de escrita — usado pela prévia "ver como". */
export function toReadOnly(perms: Set<PainelPermission>): Set<PainelPermission> {
  const result = new Set<PainelPermission>()
  for (const perm of perms) {
    if (!isWritePermission(perm)) result.add(perm)
  }
  return result
}

/**
 * Agrupamento usado só para renderizar os checkboxes de "Permissões avançadas"
 * em /painel/equipe. Toda permissão do catálogo deve aparecer em exatamente um
 * grupo — há um teste garantindo isso.
 */
export const PERMISSION_GROUPS: {
  label: string
  permissions: { perm: PainelPermission; label: string }[]
}[] = [
  {
    label: "Geral",
    permissions: [
      { perm: "dashboard.view", label: "Ver o dashboard" },
      { perm: "perfil.edit", label: "Editar o próprio perfil e senha" },
      { perm: "treinamentos.view", label: "Ver treinamentos" },
      { perm: "artes.view", label: "Baixar artes de divulgação" },
    ],
  },
  {
    label: "Alunos",
    permissions: [
      { perm: "alunos.view", label: "Ver alunos" },
      { perm: "alunos.viewAll", label: "Ver alunos de toda a unidade" },
      { perm: "alunos.manage", label: "Editar, bloquear e redefinir senha" },
      { perm: "alunos.impersonate", label: "Acessar a área do aluno como ele" },
    ],
  },
  {
    label: "Vendas e leads",
    permissions: [
      { perm: "vendas.view", label: "Ver vendas diretas" },
      { perm: "vendas.viewAll", label: "Ver vendas de toda a unidade" },
      { perm: "vendas.create", label: "Registrar nova venda" },
      { perm: "leads.view", label: "Ver leads" },
      { perm: "leads.viewAll", label: "Ver leads de toda a unidade" },
      { perm: "leads.config", label: "Configurar distribuição de leads" },
    ],
  },
  {
    label: "Catálogo e cupons",
    permissions: [
      { perm: "catalogo.view", label: "Ver o catálogo" },
      { perm: "catalogo.manage", label: "Editar cursos e preços" },
      { perm: "pacotes.manage", label: "Gerenciar pacotes" },
      { perm: "cupons.view", label: "Ver cupons" },
      { perm: "cupons.manage", label: "Criar e editar cupons" },
    ],
  },
  {
    label: "Financeiro",
    permissions: [
      { perm: "financeiro.view", label: "Ver o financeiro" },
      { perm: "financeiro.export", label: "Exportar o financeiro" },
      { perm: "cobrancas.view", label: "Ver as cobranças da unidade (mensalidade PMB)" },
      { perm: "relatorios.view", label: "Ver relatórios" },
      { perm: "relatorios.financeiro", label: "Ver a aba Financeiro dos relatórios" },
      { perm: "relatorios.indicacoes", label: "Ver a aba Indicações dos relatórios" },
      { perm: "indicacoes.view", label: "Ver indicações e comissões" },
      { perm: "indicacoes.sacar", label: "Solicitar saque de comissão" },
    ],
  },
  {
    label: "Atendimento",
    permissions: [
      { perm: "atendimento.manage", label: "Responder a caixa de atendimento" },
      { perm: "comunicacao.manage", label: "Enviar comunicados" },
      { perm: "certificados.view", label: "Ver certificados" },
      { perm: "certificados.manage", label: "Emitir e revogar certificados" },
      { perm: "certificados.template", label: "Editar o modelo do certificado" },
    ],
  },
  {
    label: "Configuração da unidade",
    permissions: [
      { perm: "vitrine.manage", label: "Editar a vitrine" },
      { perm: "dominio.manage", label: "Configurar o domínio" },
      { perm: "automacao.manage", label: "Configurar a automação" },
      { perm: "revendas.manage", label: "Gerenciar sub-revendas" },
      { perm: "configuracoes.manage", label: "Editar as configurações da conta" },
      { perm: "gateway.manage", label: "Configurar o gateway de pagamento" },
      { perm: "equipe.manage", label: "Gerenciar a equipe" },
      { perm: "conta.delete", label: "Solicitar exclusão da conta" },
    ],
  },
]
