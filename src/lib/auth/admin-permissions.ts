/**
 * Papéis e permissões da equipe interna da PMB (o "sistema mãe").
 *
 * FONTE ÚNICA DE VERDADE — a sidebar (`sidebar-admin.tsx`), os guards de rota
 * (`admin-guard.ts`), as abas do hub de BI (`lib/reports/tabs.ts`) e a tela
 * `/admin/equipe` derivam TODOS deste arquivo. Não replicar a matriz.
 *
 * Espelha o modelo já em produção do lado da unidade
 * (`painel-permissions.ts`): cada pessoa tem um PAPEL (preset) e, opcionalmente,
 * ajustes finos por pessoa (`User.extraPermissions` / `User.revokedPermissions`).
 *
 * Diferença deliberada em relação ao painel da unidade: aqui o papel também é o
 * `User.role` do Prisma, porque ele já governa login, roteamento pós-login e o
 * escopo comercial (`lib/auth/scope.ts`, que decide se a unidade é vista por
 * `accountManagerId`, `salesUserId` ou pelo time). Os presets abaixo REPRODUZEM
 * a matriz que os guards antigos aplicavam — o que muda é que agora ela é
 * declarativa e ajustável pessoa a pessoa.
 */

import { PMB_TEAM_ROLES, type PmbTeamRole } from "@/lib/auth/roles"

export type { PmbTeamRole }
export { PMB_TEAM_ROLES }

/**
 * Catálogo fechado de permissões. Convenção do sufixo:
 *   `.view`    — leitura da área
 *   `.viewAll` — ignora o escopo comercial do papel e vê a rede inteira
 *   demais     — ação de escrita
 */
export const ADMIN_PERMISSIONS = [
  // ---- Geral -------------------------------------------------------------
  "dashboard.view",
  // Auto-serviço: os próprios nome/e-mail/telefone e a própria senha. Está em
  // TODOS os presets — ninguém pode ficar sem trocar a própria senha.
  "perfil.edit",
  "treinamentos.view",

  // ---- Rede de unidades (revendas) ---------------------------------------
  "unidades.view",
  // Sem esta, a pessoa só vê as unidades atribuídas a ela pelo papel
  // (accountManagerId / salesUserId / time de vendas) — ver `lib/auth/scope.ts`.
  //
  // ATENÇÃO: esta não é só um filtro de listagem. Ela é o substituto de TODO
  // bypass `role === "SUPER_ADMIN"` do código anterior — quem a tem passa
  // direto pelo recorte de carteira em senha do titular, impersonação,
  // revogação de certificado e export de comissões. Por isso está em
  // SUPER_EXCLUSIVE: conceder por override transformaria um gerente de
  // unidades em super admin de fato, com um checkbox de nome inofensivo.
  "unidades.viewAll",
  "unidades.create",
  "unidades.manage",
  // Cobranças da unidade no Asaas: reconciliar, cancelar, reemitir.
  "unidades.billing",
  // Redefinir a senha do titular da unidade. (O gateway de vendas saiu daqui:
  // desde que o Asaas passou a valer para todas as unidades, quem escolhe e
  // conecta é a própria unidade — o /admin só lê esse estado.)
  "unidades.credenciais",
  "unidades.impersonate",
  // LGPD: anonimização definitiva dos dados da unidade.
  "unidades.anonimizar",
  "unidades.comissoes",
  // Decisões sobre a CONTA da unidade, não sobre a operação dela: atribuir o
  // gerente/vendedor responsável, habilitar módulos que geram cobrança nova
  // (revender sub-revendas) e cancelar a unidade. Separada de `unidades.manage`
  // porque o gerente de unidades administra a carteira que lhe deram — não
  // redefine quem é dono dela nem amplia o contrato.
  "unidades.governanca",

  // ---- Funil B2B (leads de revenda) --------------------------------------
  "leadsRevenda.view",
  "leadsRevenda.viewAll",
  "leadsRevenda.manage",
  "leadsRevenda.config",

  // ---- Alunos ------------------------------------------------------------
  // Alunos de TODA a rede (/admin/alunos), inclusive de unidades de terceiros.
  // Separadas de `alunos.*` porque aquelas cobrem só a vitrine da PMB, enquanto
  // estas expõem (e alteram) o aluno de um revendedor.
  "alunosRede.view",
  "alunosRede.manage",
  // Bloquear/desbloquear, vincular e desvincular curso, liberar cota de aulas.
  "alunosRede.acesso",
  // Alunos da vitrine PMB (B2C). Sem `alunos.viewAll`, a pessoa só vê os que
  // ela mesma vendeu (`soldByUserId`).
  "alunos.view",
  "alunos.viewAll",
  "alunos.manage",
  "alunos.impersonate",

  // ---- Leads B2C e atendimento -------------------------------------------
  "leads.view",
  "leads.manage",
  "atendimento.manage",

  // ---- Vendas diretas da vitrine PMB -------------------------------------
  "vendas.view",
  "vendas.viewAll",
  "vendas.create",
  // Isenta do teto de desconto (`User.maxDiscount`, padrão 50%) ao registrar
  // venda com desconto manual e ao criar cupom. Sem ela, o teto vale — antes
  // isso era `role !== "PMB_SALES" -> sem teto`, que abria 100% para qualquer
  // papel que recebesse `vendas.create`/`cupons.manage` por override.
  "vendas.descontoIlimitado",
  // Matricular como BOLSISTA: libera o curso com finalAmount 0, sem gateway.
  // Sem permissao propria, era o caminho aberto para furar o teto acima —
  // quem tomava 403 num desconto de 11% marcava "Bolsa" e dava 100%.
  "vendas.bolsa",
  "cupons.view",
  "cupons.manage",

  // ---- Financeiro --------------------------------------------------------
  // Comissões a pagar (escopadas pelo papel).
  "financeiro.view",
  // Visão geral do ecossistema + mensalidades a receber das unidades.
  "financeiro.viewAll",
  // Marcar como pago, anexar comprovante, escrever nota no lançamento.
  "financeiro.manage",
  "indicacoes.view",
  // Aprovar/reprovar o saque de uma unidade. Ação do suporte à carteira.
  "indicacoes.saques",
  // Resolver clawback (estorno de comissão já liberada/paga). Decisão
  // financeira sobre o ledger, sem recorte de carteira — separada de
  // `indicacoes.saques` porque os dois lados tinham públicos diferentes.
  "indicacoes.clawback",
  // Regras GLOBAIS do motor de comissão (faixas, plano, dia de pagamento).
  "indicacoes.config",
  // % de indicação de UMA unidade (sobrepõe a regra global naquele tenant).
  "indicacoes.percentUnidade",

  // ---- Catálogo ----------------------------------------------------------
  "catalogo.view",
  "catalogo.manage",
  "catalogo.sync",
  "pacotes.manage",

  // ---- Certificados ------------------------------------------------------
  "certificados.view",
  "certificados.manage",
  "certificados.template",

  // ---- Marca e conteúdo --------------------------------------------------
  // Vitrine PMB, banner, seções da home, EJA e unidade técnica globais.
  "vitrine.manage",
  "comunicacao.manage",
  "treinamentos.manage",
  "artes.view",
  "artes.manage",

  // ---- Relatórios (hub de BI) --------------------------------------------
  // `relatorios.view` abre o hub; cada aba tem a sua permissão (o mapa
  // aba→permissão vive em `lib/reports/tabs.ts`).
  "relatorios.view",
  "relatorios.visaoGeral",
  "relatorios.receitaVendas",
  "relatorios.alunos",
  "relatorios.revendedores",
  "relatorios.financeiro",
  "relatorios.indicacoes",
  "relatorios.cursos",
  "relatorios.leads",
  "relatorios.export",

  // ---- Sistema -----------------------------------------------------------
  "automacao.manage",
  "configuracoes.manage",
  // Tokens e chaves: Asaas/Mercado Pago da PMB, API da plataforma parceira,
  // chave de webhook. Separada de `configuracoes.manage` por ser credencial.
  "integracoes.manage",
  "equipe.manage",
] as const

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]

const ALL: readonly AdminPermission[] = ADMIN_PERMISSIONS

/**
 * Nunca concedível por override. `equipe.manage` deixaria qualquer pessoa criar
 * usuários e editar permissões — inclusive as próprias —, que é exatamente o
 * caminho de escalada de privilégio que este modelo existe para fechar.
 */
export const SUPER_EXCLUSIVE = [
  "equipe.manage",
  "unidades.viewAll",
  // Grava `Tenant.accountManagerId`: quem a tem se auto-atribui a carteira de
  // qualquer unidade e, por tabela, ganha senha do titular, impersonacao,
  // cobranca e ledger de comissao dela. Mesma escalada que fechamos em
  // `unidades.viewAll`, so que em dois passos.
  "unidades.governanca",
] as const

/**
 * Papéis cujo PRESET carrega permissão SUPER_EXCLUSIVE — e exatamente quais.
 *
 * SUPER_EXCLUSIVE quer dizer "nunca concedível por OVERRIDE" (ver
 * `resolveAdminPermissions`), não "só o super admin pode ter". A distinção é o
 * ponto: marcar `unidades.viewAll` num checkbox de quem tem carteira é escalada
 * silenciosa — o gerente de unidades viraria super admin de fato sem que o nome
 * da opção denunciasse isso. Declará-la no preset de um papel cujo trabalho É a
 * rede inteira é uma decisão explícita, revisável e testada.
 *
 * Este mapa é a lista fechada dessas decisões: o teste exige igualdade exata,
 * então nenhum preset ganha uma exclusiva sem passar por aqui.
 *
 * `equipe.manage` não entra para ninguém além do SUPER_ADMIN. É a linha que não
 * se cruza — é a permissão com que alguém ampliaria os próprios poderes.
 */
export const SUPER_EXCLUSIVE_BY_PRESET: Partial<
  Record<PmbTeamRole, readonly AdminPermission[]>
> = {
  SUPER_ADMIN: [...SUPER_EXCLUSIVE],
  // Diretor de unidades: responde por todas as revendas, logo `viewAll` é o
  // próprio conteúdo do cargo, e `governanca` (atribuir o responsável da conta)
  // não é escalada para quem já alcança todas elas.
  PMB_RESELLER_DIRECTOR: ["unidades.viewAll", "unidades.governanca"],
}

/** Concedíveis por override, mas com aviso destacado na UI de Equipe. */
export const SENSITIVE = [
  "integracoes.manage",
  "vendas.descontoIlimitado",
  "vendas.bolsa",
  "alunos.viewAll",
  "vendas.viewAll",
  "leadsRevenda.viewAll",
  "indicacoes.clawback",
  "configuracoes.manage",
  "unidades.credenciais",
  "unidades.impersonate",
  "unidades.anonimizar",
  "alunos.impersonate",
  "alunosRede.view",
  "alunosRede.manage",
  "alunosRede.acesso",
  "financeiro.manage",
  "indicacoes.config",
] as const

const SUPER_EXCLUSIVE_SET = new Set<string>(SUPER_EXCLUSIVE)

/**
 * Presets por papel — a matriz que os guards antigos aplicavam, agora explícita.
 *
 * A ausência de `unidades.viewAll` / `leadsRevenda.viewAll` / `alunos.viewAll`
 * é o que preserva o recorte comercial: sem elas, `admin-guard` cai no escopo
 * estrutural do papel (`lib/auth/scope.ts`).
 */
export const ADMIN_ROLE_PRESETS: Record<PmbTeamRole, readonly AdminPermission[]> = {
  SUPER_ADMIN: ALL,

  // Vendedor de curso (B2C): trabalha a vitrine da PMB de ponta a ponta —
  // leads, atendimento, venda direta, cupom (com cap) e a carteira de alunos
  // que ele mesmo originou.
  PMB_SALES: [
    "dashboard.view",
    "perfil.edit",
    "treinamentos.view",
    "alunosRede.view",
    "alunosRede.manage",
    "alunos.view",
    "alunos.manage",
    "leads.view",
    "leads.manage",
    "atendimento.manage",
    "vendas.view",
    "vendas.create",
    "vendas.bolsa",
    "cupons.view",
    "cupons.manage",
    "catalogo.view",
    "certificados.view",
    "certificados.manage",
    "relatorios.view",
    "relatorios.receitaVendas",
    "relatorios.export",
  ],

  // Gerente de vendas: chefia os vendedores de revenda. Vê as unidades e os
  // leads B2B do time (via `salesManagerId`), sem tocar em financeiro.
  PMB_SALES_MGR: [
    "dashboard.view",
    "perfil.edit",
    "treinamentos.view",
    "unidades.view",
    "unidades.create",
    "leadsRevenda.view",
    "leadsRevenda.manage",
    "leadsRevenda.config",
    "catalogo.view",
    "relatorios.view",
    "relatorios.revendedores",
    "relatorios.leads",
  ],

  // Vendedor de revenda (B2B): mesmo repertório do gerente, porém restrito às
  // unidades e leads atribuídos a ele. Não configura o rodízio de leads.
  PMB_REVENDA_SALES: [
    "dashboard.view",
    "perfil.edit",
    "treinamentos.view",
    "unidades.view",
    "unidades.create",
    "leadsRevenda.view",
    "leadsRevenda.manage",
    "catalogo.view",
    "relatorios.view",
    "relatorios.revendedores",
    "relatorios.leads",
  ],

  // Diretor de unidades: o Gerente de unidades sem o recorte de carteira. É o
  // único preset além do SUPER_ADMIN que carrega `unidades.viewAll` — por isso
  // ele existe como PAPEL e não como um conjunto de checkboxes: `viewAll` e
  // `governanca` são SUPER_EXCLUSIVE justamente para não serem concedidas de
  // forma avulsa a quem tem carteira (ver SUPER_EXCLUSIVE, acima).
  //
  // Fronteira deliberada — o que ele NÃO tem:
  //   - dinheiro do ecossistema (`financeiro.viewAll/manage`,
  //     `indicacoes.clawback/config/percentUnidade`): ele vê e aprova o saque
  //     da rede, quem baixa o pagamento é o Financeiro;
  //   - `unidades.anonimizar` (destruição LGPD irreversível);
  //   - catálogo, vitrine PMB, vendas B2C, integrações e `equipe.manage`.
  // Qualquer um desses é concedível pessoa a pessoa por override, exceto os
  // SUPER_EXCLUSIVE.
  PMB_RESELLER_DIRECTOR: [
    "dashboard.view",
    "perfil.edit",
    "treinamentos.view",
    "unidades.view",
    "unidades.viewAll",
    "unidades.create",
    "unidades.manage",
    "unidades.billing",
    "unidades.credenciais",
    "unidades.impersonate",
    "unidades.comissoes",
    "unidades.governanca",
    "leadsRevenda.view",
    "leadsRevenda.viewAll",
    "leadsRevenda.manage",
    "alunosRede.view",
    "alunosRede.manage",
    "alunosRede.acesso",
    "financeiro.view",
    "indicacoes.view",
    "indicacoes.saques",
    "certificados.view",
    "certificados.manage",
    "catalogo.view",
    "relatorios.view",
    "relatorios.revendedores",
    "relatorios.indicacoes",
    "relatorios.leads",
    "relatorios.export",
  ],

  // Gerente de unidades / suporte: cuida das unidades sob a sua carteira —
  // dados, status, cobrança, senha do titular e acesso "entrar como".
  PMB_RESELLER_MGR: [
    "dashboard.view",
    "perfil.edit",
    "treinamentos.view",
    "unidades.view",
    "unidades.create",
    "unidades.manage",
    "unidades.billing",
    "unidades.credenciais",
    "unidades.impersonate",
    "unidades.comissoes",
    "financeiro.view",
    "indicacoes.view",
    "indicacoes.saques",
    "certificados.view",
    "certificados.manage",
    "catalogo.view",
    "relatorios.view",
    "relatorios.revendedores",
    "relatorios.indicacoes",
    "relatorios.export",
  ],

  // Financeiro: dinheiro do ecossistema inteiro — mensalidades a receber,
  // comissões a pagar, regras de comissão e os relatórios correspondentes.
  PMB_FINANCEIRO: [
    "dashboard.view",
    "perfil.edit",
    "treinamentos.view",
    "financeiro.view",
    "financeiro.viewAll",
    "financeiro.manage",
    "indicacoes.view",
    "indicacoes.clawback",
    "indicacoes.percentUnidade",
    "relatorios.view",
    "relatorios.visaoGeral",
    "relatorios.receitaVendas",
    "relatorios.financeiro",
    "relatorios.indicacoes",
  ],

  // Designer: só o banco de artes de divulgação. Deliberadamente sem
  // `dashboard.view` — o pós-login manda direto para /admin/artes
  // (`home-for-role.ts`) e os KPIs de negócio ficam fora do papel.
  PMB_DESIGNER: ["perfil.edit", "artes.view", "artes.manage"],
}

const ROLE_DESCRIPTIONS: Record<PmbTeamRole, string> = {
  SUPER_ADMIN: "Acesso total ao sistema.",
  PMB_SALES:
    "Vitrine PMB de ponta a ponta: leads, atendimento, venda direta, cupons e a carteira de alunos que ele originou.",
  PMB_SALES_MGR:
    "Chefia os vendedores de revenda. Vê as unidades e os leads B2B do time, sem acesso ao financeiro.",
  PMB_REVENDA_SALES:
    "Trabalha os leads B2B e fecha unidades. Enxerga apenas as unidades e leads atribuídos a ele.",
  PMB_RESELLER_DIRECTOR:
    "Responde por TODAS as unidades da rede: suporte, dados, valores, cobrança, senha do titular, entrar como e governança da conta. Não baixa pagamento nem mexe em catálogo, vitrine ou equipe.",
  PMB_RESELLER_MGR:
    "Cuida das unidades sob a sua carteira: dados, status, cobrança, senha do titular e comissões.",
  PMB_FINANCEIRO:
    "Financeiro do ecossistema: mensalidades a receber, comissões a pagar, regras de comissão e relatórios.",
  PMB_DESIGNER: "Somente o banco de artes de divulgação.",
}

export function adminRoleDescription(role: PmbTeamRole): string {
  return ROLE_DESCRIPTIONS[role]
}

export function isAdminPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value)
}

/**
 * Sanitiza uma lista crua do banco (`User.extraPermissions` é `String[]`) para o
 * catálogo tipado, descartando entradas obsoletas.
 */
export function filterAdminPermissions(
  raw: readonly string[],
): AdminPermission[] {
  return raw.filter(isAdminPermission)
}

/**
 * Permissões efetivas: preset(papel) ∪ extra − revoked.
 *
 * - `extra` nunca concede SUPER_EXCLUSIVE (defesa em profundidade: a API de
 *   Equipe também rejeita, mas uma linha corrompida vinda do banco é ignorada
 *   aqui).
 * - O SUPER_ADMIN ignora `revoked` — não faz sentido o dono do sistema se
 *   auto-trancar para fora, e isso evita um estado sem ninguém capaz de gerir a
 *   equipe.
 * - Entradas fora do catálogo são descartadas silenciosamente.
 */
export function resolveAdminPermissions(
  role: PmbTeamRole,
  extra: readonly string[] = [],
  revoked: readonly string[] = [],
): Set<AdminPermission> {
  const result = new Set<AdminPermission>(ADMIN_ROLE_PRESETS[role])

  for (const perm of extra) {
    if (!isAdminPermission(perm)) continue
    if (SUPER_EXCLUSIVE_SET.has(perm)) continue
    result.add(perm)
  }

  if (role === "SUPER_ADMIN") return result

  for (const perm of revoked) {
    if (!isAdminPermission(perm)) continue
    result.delete(perm)
  }

  return result
}

/**
 * Agrupamento usado só para renderizar os checkboxes de "Permissões avançadas"
 * em /admin/equipe. Toda permissão do catálogo deve aparecer em exatamente um
 * grupo — há um teste garantindo isso.
 */
export const ADMIN_PERMISSION_GROUPS: {
  label: string
  permissions: { perm: AdminPermission; label: string }[]
}[] = [
  {
    label: "Geral",
    permissions: [
      { perm: "dashboard.view", label: "Ver o dashboard" },
      { perm: "perfil.edit", label: "Editar o próprio perfil e senha" },
      { perm: "treinamentos.view", label: "Assistir aos treinamentos" },
    ],
  },
  {
    label: "Unidades (revendas)",
    permissions: [
      { perm: "unidades.view", label: "Ver as unidades atribuídas" },
      { perm: "unidades.viewAll", label: "Ver todas as unidades da rede" },
      { perm: "unidades.create", label: "Criar unidade" },
      { perm: "unidades.manage", label: "Editar dados, status e política" },
      { perm: "unidades.billing", label: "Gerir as cobranças da unidade" },
      { perm: "unidades.credenciais", label: "Trocar senha do titular" },
      { perm: "unidades.impersonate", label: "Entrar como a unidade" },
      { perm: "unidades.comissoes", label: "Ver comissões da unidade" },
      { perm: "unidades.governanca", label: "Atribuir responsável, habilitar módulos e cancelar" },
      { perm: "unidades.anonimizar", label: "Anonimizar a unidade (LGPD)" },
    ],
  },
  {
    label: "Leads de revenda (B2B)",
    permissions: [
      { perm: "leadsRevenda.view", label: "Ver os leads atribuídos" },
      { perm: "leadsRevenda.viewAll", label: "Ver todos os leads de revenda" },
      { perm: "leadsRevenda.manage", label: "Trabalhar e converter leads" },
      { perm: "leadsRevenda.config", label: "Configurar a distribuição de leads" },
    ],
  },
  {
    label: "Alunos",
    permissions: [
      { perm: "alunosRede.view", label: "Buscar alunos de toda a rede" },
      { perm: "alunosRede.manage", label: "Editar e atender alunos de toda a rede" },
      { perm: "alunosRede.acesso", label: "Bloquear aluno e gerir o acesso a cursos" },
      { perm: "alunos.view", label: "Ver alunos da vitrine PMB" },
      { perm: "alunos.viewAll", label: "Ver os alunos PMB de toda a equipe" },
      { perm: "alunos.manage", label: "Editar, bloquear e redefinir senha" },
      { perm: "alunos.impersonate", label: "Acessar a área do aluno como ele" },
    ],
  },
  {
    label: "Vendas, leads e atendimento",
    permissions: [
      { perm: "leads.view", label: "Ver os leads da vitrine PMB" },
      { perm: "leads.manage", label: "Trabalhar os leads da vitrine PMB" },
      { perm: "atendimento.manage", label: "Responder a caixa de atendimento" },
      { perm: "vendas.view", label: "Ver as vendas diretas" },
      { perm: "vendas.viewAll", label: "Ver as vendas de toda a equipe" },
      { perm: "vendas.create", label: "Registrar nova venda" },
      { perm: "vendas.descontoIlimitado", label: "Dar desconto sem teto" },
      { perm: "vendas.bolsa", label: "Matricular como bolsista (100%)" },
      { perm: "cupons.view", label: "Ver cupons" },
      { perm: "cupons.manage", label: "Criar e editar cupons" },
    ],
  },
  {
    label: "Financeiro",
    permissions: [
      { perm: "financeiro.view", label: "Ver as comissões a pagar" },
      { perm: "financeiro.viewAll", label: "Ver a visão geral e as mensalidades" },
      { perm: "financeiro.manage", label: "Marcar como pago e anexar comprovante" },
      { perm: "indicacoes.view", label: "Ver indicações e saques" },
      { perm: "indicacoes.saques", label: "Aprovar e reprovar saque" },
      { perm: "indicacoes.clawback", label: "Resolver clawback (estorno)" },
      { perm: "indicacoes.config", label: "Configurar as regras globais de comissão" },
      { perm: "indicacoes.percentUnidade", label: "Definir o % de indicação de uma unidade" },
    ],
  },
  {
    label: "Catálogo e certificados",
    permissions: [
      { perm: "catalogo.view", label: "Ver o catálogo" },
      { perm: "catalogo.manage", label: "Editar cursos, preços e categorias" },
      { perm: "catalogo.sync", label: "Sincronizar com as fornecedoras" },
      { perm: "pacotes.manage", label: "Gerenciar pacotes" },
      { perm: "certificados.view", label: "Ver certificados" },
      { perm: "certificados.manage", label: "Emitir e revogar certificados" },
      { perm: "certificados.template", label: "Editar o modelo do certificado" },
    ],
  },
  {
    label: "Marca e conteúdo",
    permissions: [
      { perm: "vitrine.manage", label: "Editar a vitrine, o banner e a home" },
      { perm: "comunicacao.manage", label: "Enviar comunicados" },
      { perm: "treinamentos.manage", label: "Gerenciar os treinamentos" },
      { perm: "artes.view", label: "Ver o banco de artes" },
      { perm: "artes.manage", label: "Publicar e organizar artes" },
    ],
  },
  {
    label: "Relatórios",
    permissions: [
      { perm: "relatorios.view", label: "Abrir o hub de relatórios" },
      { perm: "relatorios.visaoGeral", label: "Aba Visão geral" },
      { perm: "relatorios.receitaVendas", label: "Aba Receita & vendas" },
      { perm: "relatorios.alunos", label: "Aba Alunos & matrículas" },
      { perm: "relatorios.revendedores", label: "Aba Revendedores" },
      { perm: "relatorios.financeiro", label: "Aba Financeiro" },
      { perm: "relatorios.indicacoes", label: "Aba Indicações & comissões" },
      { perm: "relatorios.cursos", label: "Aba Cursos & cupons" },
      { perm: "relatorios.leads", label: "Aba Leads & conversão" },
      { perm: "relatorios.export", label: "Exportar relatórios em CSV" },
    ],
  },
  {
    label: "Sistema",
    permissions: [
      { perm: "automacao.manage", label: "Configurar a automação" },
      { perm: "configuracoes.manage", label: "Editar as configurações do sistema" },
      { perm: "integracoes.manage", label: "Gerenciar tokens e integrações" },
      { perm: "equipe.manage", label: "Gerenciar a equipe interna" },
    ],
  },
]
