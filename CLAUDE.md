# CLAUDE.md — Profissionaliza Mais Brasil

> **Leia este arquivo INTEIRO antes de executar qualquer tarefa.**
> Documentacao detalhada esta em `/docs/`. Consulte antes de implementar.

## O Que E Este Projeto

Plataforma SaaS multi-tenant de revenda de cursos profissionalizantes online.

- **Admin Master** gerencia o ecossistema e cobra mensalidades dos revendedores via **Asaas**
- **Revendedores** tem vitrines proprias com dominio personalizado e vendem cursos via **Mercado Pago**
- **Alunos** compram cursos e sao auto-matriculados na **plataforma parceira** (plataforma white-label com API)

Nos NAO somos uma plataforma de cursos. Os alunos assistem aulas na plataforma parceira. Nos construimos a camada comercial, vitrine, gestao e cobranca.

## Progresso Atual (2026-04-15)

### O que ja esta implementado

**Fundacao (020-029):** Prisma migrado + seed · middleware multi-tenant · NextAuth v5 (credentials, roles SUPER_ADMIN/PMB_SALES/PMB_RESELLER_MGR/RESELLER) · layouts auth/main/admin/painel/loja · clients plataforma/Asaas/MP · crypto AES-256-GCM · Redis Upstash · Resend + React Email.

**Prototipos (001-019):** UIs hardcoded de todas as 19 paginas principais.

**Behaviors (030-049):** landing, auth, checkout revendedor, vitrine, curso, checkout aluno, confirmacao, dashboard/cursos/alunos/cupons/financeiro revendedor, dominio (Vercel API), vitrine config (Supabase Storage), configuracoes, onboarding, dashboards + financeiro + analytics + config do admin.

**Webhooks/Cron (050-053):** webhook Asaas (PAYMENT_RECEIVED/OVERDUE ativa/suspende tenant) · webhook MP (matricula automatica na plataforma) · cron diario 6h sync cursos (vercel.json) · auto-block/unblock de alunos via `src/lib/auto-block.ts`.

**Home vitrine (054):** home udemy-style com logo oficial + navbar/footer.

**Expansao de roles e vitrine PMB (061-067):**
- UserRole expandido para SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR, RESELLER (+ consultor via TenantMember role="consultant" com `maxDiscount`)
- Guards em `src/lib/auth/guards.ts` no padrao `{ ok, session } | { ok, response }`
- /admin/equipe (SUPER_ADMIN) — CRUD de usuarios PMB + atribuicao de tenants a gerentes
- /admin/revendedores (+ PMB_RESELLER_MGR) — lista filtrada por `accountManagerId`, aba Asaas, notas de suporte
- /admin/vendas/* (SUPER_ADMIN, PMB_SALES) — dashboard + nova venda (form single-page) + cupons (cap 50% para PMB_SALES) + alunos PMB
- /painel/equipe (RESELLER owner) — convida consultores, define `maxDiscount`
- **Vitrine PMB**: `Enrollment/Payment/Coupon.tenantId = null`; `Student.tenantId` aponta para tenant placeholder slug `__pmb__` criado lazy por `src/lib/pmb-tenant.ts`
- Env PMB: `PMB_MP_ACCESS_TOKEN` (plain), `PMB_PLATAFORMA_VENDEDOR_ID`, `PMB_PLATAFORMA_POLO`. Helpers em `src/lib/pmb-config.ts`
- Webhook MP (`src/lib/mercadopago/process.ts`) com branch `isPmbVitrine` — usa pmbContext sintetico, token plain, nao atualiza WebhookLog.tenantId
- Seed reescrito (`prisma/seed.ts`): super@/admin@ legado/vendas@/gerente@/owner1/owner2/consultor1, tenants revenda1+revenda2, 5 cursos (2 destaqueHome), 3 cupons (SUPER50, VENDAS30, CONSULT10). Cupons via findFirst+create (nao upsert) porque `@@unique([tenantId,code])` nao dedupe com NULL
- QA manual documentado em `docs/qa/PERFIS.md`

### Validacao executada em 2026-04-15

`npm install`, `npx prisma generate`, `npx tsc --noEmit`, `npm run build` — **todos verdes**. Fixes aplicados:
- Button shadcn nao suporta `asChild` — trocado por `<Link className="inline-flex ...">` direto em `src/app/admin/vendas/page.tsx`
- `MPPreferencePayer.email` exige string nao-nula — `src/app/api/admin/vendas/route.ts` valida `student.email` antes (400 se ausente)
- Coupon seed usa `findFirst`+`create` em vez de `upsert` (NULL em composite unique)

### Credenciais pos-seed (2026-04-15)

SUPER_ADMIN primario agora e `super@pmb.com.br` / `super123`. Matriz completa em `docs/qa/PERFIS.md`.

### Nova fornecedora LMS (2026-06-19, branch `feat/lms-provider`)

Segunda fornecedora de cursos: LMS proprio (host em `LMS_API_URL`; API M2M REST JSON `/api/v1`, Bearer `LMS_API_KEY`). **Aditiva** — EA legada intacta. O LMS provisiona nos parceiros por baixo (PMB → LMS → EA); financeiro 100% no PMB.

- **Discriminador:** `Course.provider` (enum `EA`|`LMS`, default EA). `Course.lmsCourseId` (UUID/cuid, chave de match do sync) + `lmsSlug`. `nome` deixou de ser unique global → `@@unique([provider, nome])` (ripple corrigido em `sync.ts` + `seed.ts`). `Enrollment.lmsEnrollmentId`, `Student.lmsStudentId`, `SystemSettings.lmsDayUpdateCursor`. Migration idempotente `prisma/migrations/20260619_lms_provider`.
- **Client:** `src/lib/lms/` (config/errors/types/client) — wrappers tipados de todos os endpoints, retry/timeout no padrao EA.
- **Fluxo:** provisionamento ramifica em `fulfill.ts` (`provisionLmsAccess` via `POST /enrollments`, Idempotency-Key = id do pagamento; `provisionCourseForStudent` cobre pacotes mistos). `provisioning.ok=false` → alerta SUPER_ADMIN e segue. Catalogo: `sync-lms.ts` + cron `/api/cron/sync-cursos-lms`. Progresso/conclusao: `lms/day-update.ts` (delta, substitui webhook) + cron `/api/cron/sync-day-update-lms` → emite certificado existente. SSO: `/api/aluno/curso/[enrollmentId]/acessar` (botao no `/aluno` ramifica EA vs LMS). Bloqueio/revogacao: branch em `plataforma-actions.ts` (`setLmsStudentAccess`/`revokeLmsEnrollment`).
- **Pendente de deploy:** rodar os 2 novos jobs em `prisma/sql/pg_cron_jobs.sql` no Supabase (pg_cron manual); setar `LMS_API_URL`/`LMS_API_KEY` no Vercel. Validado: tsc + lint verdes, build compila, conexao live `GET /api/v1/courses` → 200.

### Papeis da equipe da unidade (2026-07-28, branch `feat/painel-roles`)

Antes: a unidade tinha so `owner` e `consultant`, e os dois viam o painel
completo do dono — o filtro `ownerOnly` do menu era codigo morto (`isOwner`
default `true`, nunca passado pela layout) e 85 das 93 rotas `/api/painel`
usavam `requireResellerSession`, que nao distingue dono de membro.

- **Fonte unica:** `src/lib/auth/painel-permissions.ts` — catalogo fechado de
  permissoes, 4 papeis atribuiveis (`manager`, `consultant`, `support`,
  `finance`) + `owner`, `resolvePermissions` (preset ∪ extra − revoked).
  `OWNER_EXCLUSIVE` (`equipe.manage`, `conta.delete`) nunca e concedida por
  override. Papel desconhecido — inclusive `"owner"` numa membership — cai no
  preset mais restrito (fail-closed).
- **Guard:** `src/lib/auth/painel-guard.ts` — `requirePainel` (403) para rotas,
  `requirePainelPage` (redirect) para paginas, `painelContext` para a layout.
  Permissoes NAO vao no JWT (ficariam obsoletas por ate 60s); sao resolvidas por
  request numa query indexada.
- **Escopo de dados:** `ctx.scope.{alunos,vendas,pagamentos,leads}` usa os campos
  de autoria ja existentes (`soldByUserId`, `ownerUserId`). Sem `*.viewAll`, a
  pessoa so ve a propria carteira — nas listagens **e** nos lookups por ID.
  Cuidado: em `where` que ja usa a chave `enrollments`, o escopo tem que ir em
  `AND`, senao o spread o sobrescreve (dois vazamentos assim ja foram corrigidos).
- **Overrides por pessoa:** `TenantMember.extraPermissions/revokedPermissions`
  (migration `20260728_tenant_member_roles`, idempotente, sem backfill).
- **Previa "ver como":** cookie assinado de 30 min, so para o dono, sempre
  reduzido a somente leitura por `toReadOnly`.
- **Quebra deliberada no deploy:** consultores existentes seguem com
  `role='consultant'` e caem no preset restrito de Vendedor. Quem atuava como
  gerente precisa ser repromovido pelo dono em `/painel/equipe`.

### Papeis e permissoes do sistema mae (2026-07-28)

Mesmo modelo da unidade, agora no /admin. Antes: sete valores de `UserRole` e a
matriz reimplementada a mao em cada rota (`requireAdminSession` + um
`if (role !== "SUPER_ADMIN")`), espalhada por 139 rotas e 47 paginas — foi assim
que /admin/financeiro passou a abrir para o vendedor de curso com a unica aba da
tela retornando 403.

- **Fonte unica:** `src/lib/auth/admin-permissions.ts` — catalogo fechado de
  permissoes + um preset por papel PMB. Os presets REPRODUZEM a matriz que os
  guards antigos aplicavam (ha teste de paridade), tirando os tightenings
  listados no fim desta secao. O que muda e que a matriz virou declarativa e
  ajustavel pessoa a pessoa.
- **A autorizacao virou permissao; as regras de negocio a jusante TAMBEM
  precisam.** Foi a causa raiz de cinco escaladas pegas na revisao: o guard
  passou a aceitar quem tem a permissao, mas o teto de desconto, o filtro de
  dono do cupom e o recorte de carteira continuavam perguntando "o papel e
  PMB_SALES?" e respondendo "nao e, entao libera". Ao mover um gate para
  permissao, procure toda trava interna que dependia daquele papel.
- **`unidades.viewAll` e SUPER_EXCLUSIVE.** Ela nao e so um filtro de listagem:
  e o substituto de todo bypass `role === "SUPER_ADMIN"` do codigo antigo, e
  quem a tem passa direto pelo recorte de carteira em senha do titular,
  impersonacao, gateway e export de comissoes.
- **Recorte de carteira sai do guard, nunca e re-derivado na rota.** Use
  `ctx.canAccessTenant(tenant)` (unidade ja carregada), `ctx.unidadesWhere()`
  (listagem) ou `ctx.comissoesScope()` (dinheiro de indicacao). A derivacao
  `can("unidades.view") && !can("unidades.viewAll")` que estava espalhada era
  errada nos dois sentidos: revogar `unidades.view` REMOVIA o filtro (ampliando
  o acesso) e ela assumia `accountManagerId` para papeis ligados por
  `salesUserId`.
- **Guard:** `src/lib/auth/admin-guard.ts` — `requireAdmin` (403) para rotas,
  `requireAdminPage` (redirect) para paginas, `adminContext` para a layout.
  Variantes `requireAdminAny` / `requireAdminPageAny` quando a rota tem dois
  publicos. Permissoes NAO vao no JWT (ficariam obsoletas por ate 60s pelo
  throttle do callback); sao resolvidas por request num `findUnique` na PK.
- **Escopo de dados:** continua ESTRUTURAL, vindo de `lib/auth/scope.ts` — no
  admin a unidade pertence a alguem por `accountManagerId`, `salesUserId` ou
  pelo time de vendas, conforme o papel. As permissoes `*.viewAll` funcionam
  como "ignore o recorte do papel": `ctx.unidadesWhere()` devolve `{}` para quem
  as tem, `null` para quem nao alcanca unidade nenhuma (a rota fecha).
- **Overrides por pessoa:** `User.extraPermissions/revokedPermissions`
  (migration `20260728_user_permissions`, idempotente, sem backfill). Editaveis
  em /admin/equipe (mesmo componente de "Permissoes avancadas" do painel).
  `equipe.manage` e SUPER_EXCLUSIVE — nunca concedida por override, porque e a
  permissao que deixaria alguem ampliar os proprios poderes.
- **Invariante testada:** `src/app/api/admin/guard-coverage.test.ts` quebra se
  uma rota nova nascer sem `requireAdmin`, se uma pagina nascer sem
  `requireAdminPage`, se alguem voltar a decidir autorizacao pelo papel do ator,
  ou se um guard por papel reaparecer.
- **Revisao multi-agente (xhigh) rodada antes do commit:** 15 defeitos
  confirmados, todos corrigidos. Cinco eram escalada de privilegio real
  (cancelar cobranca de qualquer unidade, desconto e cupom de 100% sem teto,
  clawback fora da carteira, saques da rede inteira ao REVOGAR uma permissao) e
  um era IDOR na pagina de comissoes da unidade. O teste de paridade chegou a
  ratificar um alargamento como se fosse a matriz antiga — trava de regressao
  que codifica o comportamento novo nao protege nada.
- **Tightenings deliberados** (rotas que estavam largas demais e agora fecham):
  notas/senha/reenvio de e-mail do aluno e a busca global de alunos saem do
  `requirePmbTeam` (que aceitava ate o Designer) e passam a exigir
  `alunosRede.*`; o export de comissoes/saques exige `indicacoes.view`; o
  cancelamento de matricula de aluno de unidade exige `unidades.manage`.
  A aba "Exportacoes" dos relatorios some para gerente de vendas, vendedor de
  revenda e financeiro — a API de export nunca os atendeu (403). Escritas
  destrutivas que estavam sob permissao de leitura foram movidas para a de
  escrita (`artes.manage`, `vendas.create`), e trocar o token do Mercado Pago
  passou a exigir `integracoes.manage` (a tela ja escondia o campo; so o PATCH
  direto passava).

### Diretor de unidades (2026-07-29)

Papel novo `PMB_RESELLER_DIRECTOR` ("Diretor de unidades"): faz pela REDE INTEIRA
o que o Gerente de unidades faz pela carteira dele — suporte, dados, valores,
cobranca, senha do titular, entrar como, governanca da conta.

- **Por que papel novo e nao editar `PMB_RESELLER_MGR`:** `unidades.viewAll` e
  `unidades.governanca` sao SUPER_EXCLUSIVE (nao concediveis por override), entao
  so um PRESET pode carrega-las; e ampliar o gerente existente tiraria o recorte
  de carteira de quem ja opera em producao.
- **`SUPER_EXCLUSIVE` != "so o super admin tem".** Significa "nunca concedida por
  OVERRIDE". A lista de presets que legitimamente as carregam vive em
  `SUPER_EXCLUSIVE_BY_PRESET` e o teste exige igualdade EXATA — preset novo com
  exclusiva sem declarar ali quebra o build. `equipe.manage` continua fora de
  qualquer preset que nao seja o do super.
- **Nao precisou tocar em rota nenhuma:** guards, dashboard, relatorios,
  `unidadesWhere()` e `canAccessTenant()` ja chaveiam em `unidades.viewAll`.
  O que precisou mudar foi a UI que ainda gateava por `role === "SUPER_ADMIN"`
  (lista de revendedores e edicao de subdominio) — agora recebe flags de
  permissao da API.
- **Nova rota `GET /api/admin/revendedores/gerentes`** (`unidades.governanca`):
  o seletor "atribuir gerente de conta" lia de `/api/admin/equipe`, que exige
  `equipe.manage` — o diretor via o seletor vazio.
- **Fora do papel, de proposito:** financeiro global (`financeiro.viewAll/manage`,
  clawback, regras de comissao), `unidades.anonimizar`, catalogo, vitrine, vendas
  B2C, integracoes e equipe. Ele VE e aprova saque da rede; quem da baixa no
  pagamento e o Financeiro.
- **Deploy:** migration `20260729_pmb_reseller_director_role` so adiciona o valor
  no enum (idempotente, sem backfill). Ninguem vira diretor sozinho — promova em
  /admin/equipe.

### Par ver/editar em todas as areas (2026-07-31)

O modelo de permissoes ja tinha `.view` vs `.manage` na maioria das areas, mas a
disciplina nao era uniforme. Tres buracos, nos dois paineis:

- **Areas so com `.manage`** — para CONSULTAR vitrine, dominio, automacao,
  equipe, configuracoes, integracoes, gateway, atendimento, comunicacao, pacotes
  e sub-revendas era preciso conceder o poder de ALTERA-LAS. Nao existia acesso
  somente-leitura.
- **Escrita guardada por leitura** — PATCH, DELETE, mudanca de etapa, atividades
  e WhatsApp de lead no painel exigiam apenas `leads.view`. **`leads.manage` nao
  existia.** O preset do Vendedor tem `leads.view`: ele APAGAVA lead.
- **UI sem gate** — 30 paginas abriam com `.view` e desenhavam o botao de
  escrita assim mesmo; o 403 so aparecia depois do clique. O caso visivel era
  `/painel/cupons` mostrando "Novo cupom" para quem so tem `cupons.view`.

**Mecanismo — `WRITE_IMPLIES_READ`** (um mapa em cada catalogo de permissoes):
toda escrita concede a leitura da sua area, entao criar os `.view` faltantes NAO
mexeu em preset nenhum (quem editava continua enxergando). A revogacao usa o
mapa ao contrario e e **fail-closed**: revogar `catalogo.view` derruba
`catalogo.manage` junto — sem isso, tirar a leitura deixava a pessoa sem a tela
e com o PATCH liberado, que e pior do que nao ter revogado nada. `applyImplications`
faz UMA passada; ha teste exigindo que nenhuma chave do mapa seja tambem um alvo.

**Nenhum preset ganhou `.view` novo.** As permissoes de leitura novas nascem
fora de todos os presets e sao concedidas pessoa a pessoa nos checkboxes de
"Permissoes avancadas". Excecao: `leads.manage` entrou em `manager` e
`consultant` para preservar o que eles ja faziam.

- **Guards:** 43 handlers reapontados — todo GET para `.view`, toda escrita para
  a permissao de escrita. Menus (`sidebar-admin`/`sidebar-painel`) passaram a
  gatear pela LEITURA, senao quem tem acesso somente-leitura alcancava a pagina
  pela URL mas nao pelo menu. Sub-item de menu agora aceita `perm` propria
  ("Criar revenda" some numa secao aberta para leitura).
- **UI:** `src/components/shared/permissions/permission-context.tsx` — os dois
  layouts ja entregavam o conjunto de permissoes ao client, agora via contexto.
  `useCan`/`Can` para gate pontual e `WriteGate` para tela de formulario
  inteira (envolve em `<fieldset disabled>`, que desabilita nativamente todo
  controle aninhado + banner de somente-leitura). `WriteGate` aceita LISTA de
  permissoes = "basta uma" (telas que misturam areas, como /admin/configuracoes).
  Fora do provedor, `useCan` devolve `false` — fail-closed.
  **Limite:** `fieldset disabled` nao neutraliza `<a>` nem handler em `div`;
  nesses casos gatear explicitamente com `<Can>`.
- **Invariante testada:** `guard-coverage.test.ts` (admin e agora painel) quebra
  se um POST/PUT/PATCH/DELETE nascer guardado so por `.view`. Verificada POR
  MUTACAO nos dois lados antes do commit. Ha tambem teste exigindo que toda
  escrita do catalogo declare seu par de leitura — permissao nova sem par quebra
  o build.
- **Divida registrada, nao escondida:** `/api/painel/equipe/*` e
  `/api/painel/revendas/*` ainda usam guard por PAPEL
  (`requireResellerOwner`/`requireResellerSeller`) e por isso nao respondem a
  overrides. Lista FECHADA num teste: rota nova com guard por papel quebra.
- **Nao e vazamento hoje, mas mudou o menu:** `/painel/configuracoes` (a tela da
  propria senha) era gateada no menu por `configuracoes.manage` e sumia para
  quase todo mundo; passou a `perfil.edit`. E a lista de "Modulos" em
  /admin/configuracoes era escondida por `integracoes.manage`, que nao tem
  relacao com aquelas telas — agora cada modulo declara a permissao do proprio
  destino.

### API de parceiros — consulta de unidades (2026-08-05)

Superficie de saida do PMB para SISTEMAS DE TERCEIROS: dado um identificador
unico, devolve os dados completos da unidade (revenda). Contrato em
`docs/api/parceiros-v1.md`.

- **Rotas:** `GET /api/v1/unidades/lookup?<campo>=<valor>`, atalho por path
  `GET /api/v1/unidades/{identificador}` e `GET /api/v1/ping` (verificacao de
  chave). Servidas no dominio da PMB; o proxy nao reescreve `/api`.
- **Chave por INTEGRADOR, nao segredo unico em env** (model `ApiKey`, migration
  idempotente `20260805_partner_api_keys`). Guardamos so o SHA-256 — o segredo
  aparece UMA vez, no POST que o criou. Revogar derruba so aquele parceiro.
  SHA-256 e nao bcrypt porque o segredo e CSPRNG de 256 bits: o hash rapido e o
  que permite lookup por indice unico. **Sem chave ativa, /api/v1 responde 401
  para todo mundo** — nada a ligar no deploy.
- **Identificadores:** `email`/`cpf`/`telefone` do TITULAR (`User`), e
  `id`/`slug`/`dominio`/`codigo` da unidade. Dois campos na mesma requisicao =
  400: se apontassem para unidades diferentes, escolher um seria errar calado.
  `?q=` deduz o tipo — CPF x celular (ambos 11 digitos) pelo DV; slug/id/codigo
  sao indistinguiveis pela forma, entao a consulta cobre os tres num `OR` e a
  resposta diz qual casou.
- **`telefone` e o unico sem unicidade** (`User.phone` nao tem `@unique` e foi
  gravado como a pessoa digitou). Comparacao normalizada em memoria sobre os
  titulares (1 linha por unidade); empate devolve 409, nunca um palpite.
- **`unidade-payload.ts` e a FRONTEIRA de dados** — allowlist, com teste que
  quebra se nome proibido entrar no select. Fora: credencial de gateway,
  segredo de webhook, mensalidade, comissao, PIX, dados de aluno. CPF do
  titular sai mascarado. Recurso novo pede escopo novo + allowlist propria;
  ampliar `unidades.read` daria ao parceiro o que ele nao contratou.
- **Gestao:** /admin/configuracoes → aba API (`integracoes.view` para ver,
  `integracoes.manage` para criar/revogar). Criacao/alteracao/revogacao entram
  em `audit_logs` (`api_key.*`), sem o segredo. A listagem mostra ultimo uso,
  IP e total de chamadas — olhe antes de revogar.
- **Limite:** 120 req/min POR CHAVE (`rateLimitByKey`), nao por IP: o limite e
  do contrato, nao da maquina de saida.

### Venda direta com mais de um curso (2026-08-05)

Antes, uma venda direta (no /admin e no /painel) era de UM curso ou de UM pacote
do catalogo. Vender dois cursos avulsos exigia duas vendas, duas cobrancas e
dois links — e o desconto/cupom nao enxergava o total.

- **Reusa a mecanica do PACOTE, sem produto no catalogo.** A venda vira UMA
  cobranca do valor somado: a matricula PRIMARIA (1o curso da lista) carrega o
  Payment e lista os extras em `Enrollment.bundleCourseIds`; no fulfill cada
  extra vira uma matricula SATELITE (finalAmount 0, sem Payment, sem dupla
  receita). Migration idempotente `20260805_enrollment_bundle`.
- **`primaryEnrollment` e o ponteiro que faltava** — vale para os DOIS casos
  (pacote e multi-curso). E por ele que a COTA DE AULAS descobre o parcelamento
  de uma satelite, que nao tem cobranca propria (ONE_TIME, `installmentsTotal`
  null). Sem ele, o curso 2 de uma venda em 6x saia 100% liberado ja na 1a
  parcela. O backfill da migration liga as satelites de pacote JA EXISTENTES —
  com desempate deterministico, porque `(student_id, course_package_id)` nao e
  unico (o mesmo aluno pode ter comprado o mesmo pacote duas vezes).
- **O plano NAO e copiado para a satelite de proposito:** `installmentsTotal` e
  campo de COBRANCA (sweep do carne, varredura de inadimplencia) e a copia faria
  esses jobs tratarem a satelite como se tivesse boleto proprio. A heranca fica
  em UM lugar: `effectivePacePlan` (pace-gate.ts). Toda leitura que alimenta as
  funcoes de cota precisa espalhar `PACE_PRIMARY_SELECT` — sem ele a satelite se
  apresenta como curso quitado e escapa da cota calada. O `where` gemeo
  (`PACE_GATED_WHERE`, usado pela varredura diaria) tem teste de PARIDADE com
  `isPaceGatedPlan`.
- **Ordem importa no fulfill:** as satelites so podem ser avaliadas pela cota
  DEPOIS da transacao que grava `installmentsPaid` da primaria. Avaliar antes le
  "0 de N parcelas pagas" e bloqueia o aluno em 0% no ato da compra — cortando o
  acesso e mandando "voce ja assistiu tudo o que as parcelas liberam" junto com
  a confirmacao. Quem avalia e `evaluateSatellitePaceGates`, no chamador.
- **A satelite herda `tenantCourseId`** na venda de unidade: e a coluna pela qual
  o DELETE /api/painel/cursos/[id] conta matriculas ativas antes de deixar
  remover um curso da vitrine. Satelite sem ela sumia dessa contagem.
- **Descricao da cobranca** ("3 cursos: A, B, C") vem de `saleItemLabel` na venda
  direta e de `descreverItemCobranca` (multi-course-server.ts) nas rotas de
  checkout — senao o boleto do valor somado chega nomeando so o curso principal.
  `multi-course.ts` e PURO porque os formularios de venda (client) importam
  `MAX_SALE_COURSES` dali; o que toca o banco mora no `-server`.
- **Curso mensal so e vendido sozinho:** somar mensalidade ao preco a vista de
  outros numa cobranca unica cobraria so o 1o mes pelo conjunto.
- **Gates:** duplicidade olha TODOS os cursos da venda (senao o aluno paga de
  novo por um curso que ja tem, so por nao ser o primeiro da lista); curso
  inativo ou ja matriculado no fulfill alerta o SUPER_ADMIN em vez de sumir
  calado (o valor foi cobrado); rollback de venda que falhou apaga as satelites
  junto (`rollbackSaleEnrollment`) — orfas ACTIVE travariam toda nova tentativa
  com 409.
- **Quebra de contrato interna:** `/api/painel/vendas` passou de `tenantCourseId`
  para `tenantCourseIds` (e `/api/admin/vendas` de `courseId` para `courseIds`).
  Clientes atualizados no mesmo commit.

### Cota de aulas LIGADA em producao (2026-08-07)

A trava proporcional ao pagamento (`pace-gate.ts` + `pace.ts`, escrita em
2026-07-22) estava **desligada em producao desde que foi escrita**:
`SystemSettings.paceGateEnabled = false`, nenhum tenant sobrescrevendo. Todo o
motor rodava e devolvia cedo. O caso que expos foi um aluno de carne 6x que
pagou 1 parcela (16% liberados), assistiu 45% do curso e nao foi travado —
inadimplencia nao pegava porque a 2a parcela nem tinha vencido.

- **Ligada globalmente** (`pace_gate_enabled = true`, `strict` continua false) e
  varredura disparada na hora. Regra: `cota = floor(pagas/total x 100)`; vale
  para `BOLETO_INSTALLMENT` e `MONTHLY` com mais de 1 parcela. Compra a vista e
  cartao parcelado ficam de fora — nos dois o valor ja foi autorizado.
- **Interruptor ganhou tela:** `/admin/configuracoes/cota-aulas`
  (`configuracoes.view` para ver, `configuracoes.manage` para alterar) +
  `PUT /api/admin/system-settings/pace-gate`, auditado. Antes so existia a
  coluna — ligar/desligar exigia SQL na producao. A tela mostra o impacto
  (matriculas sob a regra, quantas passaram da cota, quantas estao travadas)
  antes de o dono virar a chave. O override por unidade (`Tenant.paceGateEnabled`)
  continua so no banco.
- **A 1a cobranca nao avaliava a PROPRIA matricula** — so as satelites. Numa
  venda 6x o curso principal nascia sem teto no LMS e a trava so chegava depois,
  reativa, quando o aluno ja tivesse assistido alem do que pagou. `fulfill.ts`
  passou a chamar `evaluatePaceGate(enrollment.id)` logo apos a transacao que
  grava `installmentsPaid` (antes dela leria zero parcelas pagas e travaria o
  aluno em 0% no ato da compra).
- **`paceAppliedPercent` virou "ultima cota PROPAGADA", nao "calculada".** Era
  gravado antes/independentemente do `PATCH /enrollments/:id/limit` do LMS: um
  envio falho ficava marcado como aplicado, a comparacao batia na passada
  seguinte e a re-tentativa prometida no log **nunca saia** — o aluno que pagou
  seguia preso no teto antigo. Agora falha grava null, e null e o sinal de
  "ainda ha teto a mandar" que a varredura procura. `applyLmsLimit` devolve
  tri-estado (`applied` / `skipped` / `failed`) porque "nao havia teto a mandar"
  (matricula da EA) e "mandei e falhou" caem os dois no corte por aluno, mas so
  o segundo pede nova tentativa.
- **A varredura diaria ignorava quem nunca andou:** o filtro exigia
  `progressPercent > 0`. Matricula parcelada com 0% ficava com o curso INTEIRO
  aberto no LMS ate o aluno passar da cota. Entrou a clausula
  `{ paceExemptAt: null, paceAppliedPercent: null }` — auto-limitada, some do
  filtro na 1a passada bem-sucedida.
- **Confirmado ponta a ponta em prod:** `PATCH /enrollments/:id/limit` do LMS
  responde 200 e guarda `maxPercent` (o comentario em
  `/api/aluno/curso/[id]/acessar` dizendo "enquanto o LMS nao expoe o limite"
  esta desatualizado). Como a rota de SSO tambem recusa matricula com
  `paceBlockedAt`, hoje o aluno travado perde o acesso a TUDO daquele curso,
  inclusive a fatia que pagou — mais duro que o "teto, nao revogacao" do
  contrato do LMS. Deliberado por ora; afrouxar e uma decisao comercial.

### Churn honesto + cortesia excepcional (2026-08-07)

O churn contava como cliente perdido quem nunca foi cliente. A formula era
`canceladas / total` num snapshot lifetime, DUPLICADA em tres lugares com
filtros divergentes (`bi/financeiro.ts`, `api/admin/financeiro`,
`api/admin/analytics` — este ultimo nem tinha o `planValue > 0`). Unidade que
nasceu cortesia, ganhou prazo esticado ou foi suspensa antes do 1o boleto
entrava no numerador; `PENDING` que nunca pagou inflava o denominador.
Medido em prod: **9,5% -> 4,4%**, e **20 unidades** (13 suspensas + 7
canceladas) foram para o balde novo "Nunca ativou".

- **Fonte unica:** `src/lib/tenants/lifecycle.ts` — clausulas `where`
  (`EVER_PAID_*`, `NEVER_ACTIVATED_WHERE`, `CHURN_BASE_WHERE`), as constantes de
  prazo e o gate `assertCortesiaExcepcional` (PURO, sem I/O). Um arquivo so: os
  relatorios importam as clausulas, as rotas importam o gate.
- **O predicado e SO "nunca pagou"** — as tres situacoes do pedido (nunca pagou
  / cortesia / vencimento futuro) colapsam nele. `planValue === 0` como clausula
  independente estaria ERRADO: e o valor de HOJE, sobrescrito sem historico, e
  classificaria como "nunca ativou" a unidade que pagou 6 meses, virou cortesia
  e so depois cancelou — churn real. "Nunca pagou" e monotonico.
- **`Tenant.activatedAt` NAO serve de prova de pagamento** — parece servir (so o
  webhook o grava), mas a migration `20260620_referral_commission_tiers` fez
  backfill com `COALESCE(MIN(paid_at), created_at)`: o fallback carimbou 12
  unidades que nunca pagaram. Usa-lo devolveria o churn a 9,7% e anularia a
  mudanca. O ledger `tenant_payments` E confiavel — verificado em prod que
  nenhuma cobranca paga virou `DELETED` (`DELETED` = cobranca em aberto removida
  do Asaas no cancelamento).
- **`RECEIVED_IN_CASH` entrou em `EVER_PAID_STATUSES`**, nao em `PAID_STATUSES`:
  aquela constante alimenta /painel/cobrancas e o cron de lembretes, raio de
  explosao diferente. Zero linhas hoje — e blindagem.
- **O gate olha o status de ORIGEM, nao o de destino.** Foi o furo que anulava o
  recurso: `SUSPENDED -> PENDING` (destino nao e ACTIVE, passa) e depois
  `PENDING -> ACTIVE` (origem nao e mais suspensa, passa) reativavam de graca com
  duas chamadas licitas. Por isso `REACTIVATING_STATUSES = ["ACTIVE","PENDING"]`.
  Ha teste dedicado, **verificado por mutacao**.
- **4 rotas guardadas:** `status` (reativar), `billing` (planValue 0 / promo /
  vencimento > D+10), `payments/[paymentId]` (adiar a cobranca individual — o
  mesmo prazo, uma a uma) e `mark-paid`, que **nao bloqueia** (registrar PIX
  recebido por fora e o caminho legitimo de sair da trava) mas grava
  `tenant.cortesia_excepcional.laundered` e notifica o SUPER_ADMIN **sem
  `category`**, para nao poder ser silenciado por preferencia.
- **Permissao `unidades.cortesiaExcepcional`** e SUPER_EXCLUSIVE — concedida por
  override, seria um checkbox de nome ameno reabrindo o buraco. Nao esta no
  preset do Diretor de unidades de proposito.
- **403 devolve `requiresReason: true`** quando a pessoa TEM o poder e so falta
  justificar — e o que faz a UI abrir o dialogo (`cortesia-reason-dialog.tsx`)
  em vez de mostrar erro seco. O motivo vai para `audit_logs`; tentativas
  NEGADAS tambem sao auditadas.
- **Prazo tolerado = D+10** (`DEFAULT_FIRST_DUE_DAYS + CORTESIA_GRACE_DAYS`),
  calibrado nos casos reais: `valedosaber` nasceu D+20, `andersoncidade` D+15,
  `concluirconsultoriaeducacional` D+11 — nenhuma pagou. Comparacao em dia civil
  brasileiro (`brDayStartUtc`), senao o servidor em UTC erra por um dia.
- **Descoberta lateral:** `promoValue`/`promoMonths` NUNCA foram usados em
  producao. O "periodo promocional" que o dono descreve sempre foi vencimento
  esticado na mao.
- **Fora de escopo, por decisao do dono:** a blacklist e por TENANT, nao por
  pessoa — nada impede cancelar e criar outra unidade cortesia para o mesmo
  dono; e nao ha piso de `planValue` (R$ 1 passa).
- **Deploy:** migration `20260807_tenant_payments_ever_paid_idx` (indice parcial,
  `CONCURRENTLY`, idempotente, sem backfill). A lista de status dele espelha
  `EVER_PAID_STATUSES` — mudou la, migration nova aqui, senao o Postgres para de
  usar o indice em silencio.

### Revisao da cortesia: 10 defeitos + trava por titular (2026-08-08)

Revisao multi-agente (29 agentes) sobre a feature JA EM PRODUCAO achou 10
defeitos. Os quatro primeiros valem como padrao, nao so como conserto:

- **O gate nao cobria `PENDING`.** `neverActivated` exigia SUSPENDED/CANCELLED,
  mas a criacao fixa a 1a cobranca em D+3: os prazos esticados que calibraram a
  regra so podem ter sido gravados enquanto a unidade ainda era PENDING — ela so
  vira SUSPENDED DEPOIS de vencer. O caminho que PRODUZIU o problema era o unico
  que continuava aberto. Agora `REQUIRES_INACTIVE` separa por gatilho: reativar
  exige estar fora do ar; free/promo/postpone/discount valem em qualquer status
  enquanto ela nunca tiver pago.
- **Status de cobranca e MUTAVEL.** `asaas/process.ts` faz upsert do status atual
  a cada evento, entao estorno/chargeback reescreve a linha que era RECEIVED e
  apaga o pagamento. Predicado passou a aceitar `paidAt IS NOT NULL`, que
  sobrevive as transicoes. Qualquer regra de "ja aconteceu" precisa de um campo
  que nao seja reescrito.
- **Gate parcial e gate furado.** O `dueDate` do PATCH de cobranca estava
  guardado e o `value` do MESMO handler nao: reprecificar para R$ 0,01 fazia a
  unidade "pagar" e sair da trava para sempre. Ao gatear um handler, olhe TODOS
  os campos que ele escreve.
- **Teto ancorado em "hoje" desliza.** Adiar todo dia para hoje+10 empurrava o
  vencimento indefinidamente sem NUNCA ser bloqueado nem auditado. A ancora
  virou `Tenant.createdAt`, que e imutavel.

Os outros seis: auditoria de concessao gravada ANTES da escrita (502 deixava
linha fantasma); `loadTenantLifecycle` sem teste nenhum (remover o filtro de
pagamento mantinha os 1646 verdes); erro da retentativa pintado ATRAS do overlay
do modal; Escape durante a requisicao fechava o dialogo mas concedia; card de
/admin/financeiro ainda rotulado "Churn rate" com limiar de 5% sobre base nova;
`CREATE INDEX CONCURRENTLY IF NOT EXISTS` nao e re-executavel (build abortada
deixa indice INVALID que o `IF NOT EXISTS` passa a pular para sempre).

**Trava por TITULAR.** A trava era por TENANT — cancelar a unidade que nunca
pagou e abrir outra de graca para o mesmo dono contornava tudo.
`findBlockedUnitsForPerson` casa por CPF, e-mail e telefone; o telefone EM
MEMORIA, porque `User.phone` nao tem unicidade e foi gravado como a pessoa
digitou (mesmo caminho da API de parceiros). Vale so para unidade que nasce SEM
PAGAR: a preco cheio a pessoa volta como cliente de verdade e, se nao pagar, cai
na trava sozinha. Fica no nucleo `createReseller`, entao /admin e o painel
herdam a regra e um chamador novo nao nasce sem ela.

**Cancelamento em lote** das que nunca pagaram: filtro "Nunca ativou" em
/admin/revendedores + `POST /api/admin/revendedores/cancelar-lote`
(`unidades.governanca`, a mesma do cancelamento individual). O servidor
RE-DERIVA a elegibilidade — os ids do corpo sao FILTRO sobre `NEVER_ACTIVATED_WHERE`,
nunca a fonte da verdade. Cada unidade segue a `cancellationPolicy` DELA para os
alunos. **Nao move o churn:** o predicado ja exclui quem nunca pagou dos dois
lados da razao; elas so migram de "suspensas" para "canceladas" dentro do mesmo
balde. `lib/resellers/cancel.ts` e o nucleo compartilhado com o DELETE
individual — duplicar um fluxo destrutivo que fala com o Asaas e como as duas
metades divergem em silencio.

### Responsavel financeiro para aluno menor (2026-08-13)

Existia UMA identidade por venda: o `Student` era ao mesmo tempo quem estuda e
quem paga. Como o gateway exige pagador adulto com CPF, a unica forma de vender
para um menor era cadastrar a MAE como se fosse a aluna — e o **certificado, que
le `Student.nome`/`cpf` no ato da emissao, saia no nome dela**. Nao havia regra
de idade em lugar nenhum do codigo.

- **O banco JA TINHA os campos, mortos:** `nascimento`, `responsavel`,
  `rgResponsavel`, `cpfResponsavel` vieram da migration inicial (herdados do
  schema da EA, que sempre aceitou esses campos) e nunca foram escritos.
  Migration `20260813_responsavel_financeiro` so acrescenta contato
  (`responsavel_email/fone/parentesco`), `responsavel_definido_em`,
  `responsavel_asaas_customer_id`, os dois campos de revisao de titularidade e
  `certificates.corrected_*`. Aditiva e idempotente, sem backfill.
- **Fonte unica:** `src/lib/students/guardian.ts` — `isMinor` (dia civil BR via
  `brDayStartUtc`), `guardianRequirement`, `guardianShape` + `withGuardianRule`
  (shape e refine ACOPLADOS, para nenhuma rota reimplementar a regra) e a
  escrita tri-estado `GuardianWrite`. **`nascimento = null` significa
  DESCONHECIDO, nunca "adulto"**, e `UNKNOWN` NUNCA bloqueia — 217 dos 230
  alunos em producao nao tem data, e travar a recompra deles seria um apagao.
- **O pagador foi desacoplado ANTES da UI, e a ordem e restricao, nao
  preferencia.** `src/lib/checkout/payer.ts` (`PAYER_SELECT`/`resolvePayer`):
  como `resolvePayer` so aceita `PayerSource`, todo call site com `select` mais
  estreito NAO COMPILA — o compilador substitui um teste estrutural. Os
  contratos de gateway tiveram `studentNome/studentCpf` **renomeados** para
  `payer*`: o rename quebra a compilacao nos call sites de proposito (um campo
  opcional seria esquecivel). Se a UI viesse primeiro, o primeiro responsavel
  coletado geraria cobranca no CPF do menor.
- **A regra do pagador e DATA-DRIVEN, nao CLOCK-DRIVEN:** vence quem esta na
  ficha (`responsavel` + `cpfResponsavel`), nao "quem e menor hoje". Assim o
  aluno que faz 18 no meio de um carne continua cobrando o mesmo customer
  Asaas, sem assinatura orfa.
- **`responsavelAsaasCustomerId` e coluna separada de proposito.** Gravar o
  `cus_` da mae em `asaasCustomerId` faria o aluno cobrar nela PARA SEMPRE,
  inclusive depois dos 18 — e, como o codigo reusa o customer em cache, o erro
  nunca seria detectado. Ha teste de mutacao nas duas colunas.
- **CPF do responsavel != CPF do aluno** e trava no refine: sem ela o
  `findOrCreateAsaasCustomer` (dedupe por `cpfCnpj`) resolveria os dois papeis
  para o MESMO customer e a separacao viraria no-op.
- **O gate que de fato segura e o do aluno EXISTENTE**, nao o do cadastro novo:
  a maior parte das vendas usa a aba "buscar aluno". `/api/painel/vendas`
  recusa com `GUARDIAN_REQUIRED` + `studentId`, e as duas telas de venda mostram
  o aviso com link para completar a ficha ANTES do submit.
- **Login passou a aceitar o CPF do RESPONSAVEL** (`src/lib/auth.ts`, `OR` em
  `cpfResponsavel` + indice). Sem isso, corrigir a titularidade (o `cpf` vira o
  do filho) tiraria o acesso da mae em silencio — e era ela quem vinha entrando.
- **Remediacao do passado** (`src/lib/students/titularity/`): fila em
  `/admin/alunos/titularidade` e `/painel/alunos/titularidade`. Dimensionada
  pelos numeros REAIS de producao (230 alunos, 51 certificados em 17 alunos):
  **sem model de fila, sem cron de varredura, sem lote** — os sinais sao
  calculados na hora. Nao existe deteccao confiavel (o nome da mae e um nome de
  aluno valido; o CPF nao codifica data de nascimento); a maquina ordena, a
  pessoa decide, nada auto-corrige.
- **O certificado corrigido MANTEM o `code`.** Ele ja circulou; troca-lo faria
  `/validar/{code}` responder "nao encontrado" para quem conferisse o codigo
  antigo — **le como fraude**. E NAO se reemite: `force` grava
  `completionDate: new Date()` (a data de conclusao viraria hoje) e obrigaria a
  revogar o original, deixando "Certificado revogado" em vermelho na pagina
  publica de um aluno legitimo. Corrige-se o snapshot e nulifica-se
  `pdfUrl`/`pdfGeneratedAt` (forma documentada de forcar regeneracao), com
  regeneracao ansiosa apos o commit.
- **Auditoria DENTRO da transacao**, contra o padrao do projeto: `logAudit`
  engole falha de persistencia por design, e para reescrita de documento oficial
  um buraco silencioso na trilha e inaceitavel. Um `AuditLog` por certificado.
- **Permissao CONJUNTA, sem permissao nova:** corrigir cadastro exige
  `alunos.manage`; reescrever certificado exige tambem `certificados.manage` —
  quem atende conserta ficha, mas nao reescreve diploma. Criar permissao nova
  obrigaria a mexer nos dois catalogos, no `WRITE_IMPLIES_READ`, em todos os
  presets e nas listas de rotulos.
- **EA passou a receber `responsavel`/`cpf_responsavel`/`rg_responsavel`** (o
  contrato sempre aceitou). O comentario de `platform-state.ts` que justificava
  a omissao por "nao temos valor autoritativo" foi ATUALIZADO — sem isso o
  proximo leitor removeria o campo de novo. `text()` descarta vazio, entao campo
  nulo do nosso lado PRESERVA o que a EA tem (mandar string vazia seria a mesma
  classe do incidente de 2026-08-05). LMS fica de fora: `{name, email}` so, e
  ele nao cobra nem certifica.
- **Invariante testada:** `src/lib/students/guardian-coverage.test.ts` quebra se
  uma rota nova criar aluno sem importar a regra, se `prisma.student.create`
  aparecer fora dos dois pontos conhecidos, ou se `lib/certificates/**` passar a
  ler campos do responsavel. Verificada POR MUTACAO, junto com `isMinor`, a
  trava de CPF igual e a escrita tri-estado.
- **Decisoes do dono:** CPF do aluno obrigatorio (inclusive menor); data de
  nascimento obrigatoria em toda porta de venda; e-mail do responsavel em campo
  proprio (o do aluno segue sendo a chave de login).
- **`certificate_require_cpf` LIGADO em producao (2026-08-13).** Impacto medido
  antes de virar a chave: 1 aluno sem CPF, sem matricula ativa, e ZERO
  certificados emitidos sem CPF — ninguem foi bloqueado. Toggle em
  /admin/certificados/configuracoes.
  - O gate deixou de lancar `Error` generico e virou `MissingCpfError`, no
    mesmo padrao do `PaceGateError`: recusa ESPERADA e ACIONAVEL. Antes o aluno
    recebia "nao foi possivel emitir agora, tente novamente" — conselho que
    nunca funcionaria, porque repetir nao preenche CPF nenhum.
  - **A correcao de titularidade passou a EXIGIR o CPF do aluno quando ha
    certificado a reescrever.** Ela permitia CPF vazio (para nao travar o
    conserto do NOME de cadastro legado); com a exigencia ligada isso gravaria
    `studentCpf: null` num documento — trocaria um certificado errado por um
    certificado incompleto. Sem certificado emitido, o CPF segue opcional: a
    maioria dos cadastros a corrigir nao tem documento, e travar tudo por um
    RG que a unidade nao tem em maos seria pior.
- **Divida registrada:** dois irmaos menores com o mesmo e-mail continuam sem
  caber (`@@unique([tenantId, email])`); a mensagem de conflito passou a
  explicar em vez de so barrar. O conserto real e login/identidade por CPF —
  fora de escopo, raio grande.

**Revisao multi-agente antes do commit: 15 defeitos, todos corrigidos.** Os que
valem como padrao, nao so como conserto:

- **Familia de permissao errada.** As rotas de titularidade nasceram sob
  `alunos.*` (vitrine B2C da PMB) quando alcancam aluno de QUALQUER unidade —
  `alunosRede.*`. Efeito duplo: quem tinha `alunos.manage` reescrevia certificado
  de aluno de revenda por um gate mais fraco que o da edicao comum, e o **Diretor
  de unidades**, cujo trabalho e exatamente esse, tomava 403 e nem via o menu.
  Ao criar rota que toca aluno, conferir QUAL das duas familias se aplica.
- **Recorte de carteira esquecido.** A fila e a correcao do painel filtravam so
  por `tenantId`, sem `ctx.scope.alunos`. O preset de Vendedor tem
  `alunos.view/manage` e NAO tem `alunos.viewAll`: ele listava nome, e-mail e CPF
  de toda a unidade e podia reescrever qualquer cadastro. Toda rota
  `/api/painel/alunos*` espalha esse filtro — rota nova tambem tem que espalhar.
- **A regra compartilhada bloqueava o proprio caminho de remediacao.**
  `withGuardianRule` recusa responsavel sem data de nascimento e exige
  e-mail/telefone/parentesco — correto na VENDA, fatal na correcao de cadastro
  LEGADO, que sempre nomeia responsavel e quase nunca tem esses dados. Vieram as
  opcoes `requireNascimentoComResponsavel` e `requireGuardianContact`. Regra
  unica nao significa regra unica-forma.
- **Checkout ANONIMO podia APAGAR responsavel.** `buildGuardianWrite` devolvia
  `null` (= limpar) quando o bloco nao vinha, entao refazer o checkout de um
  menor com uma data de adulto zerava o responsavel ja verificado e mandava a
  cobranca seguinte para o CPF da crianca. Os 4 checkouts publicos passaram a
  usar `allowClear: false`: fluxo anonimo ADICIONA, nunca REMOVE.
- **`OR` em login e armadilha.** O `OR: [{cpf}, {cpfResponsavel}]` num `findFirst`
  sem ordem podia devolver a linha do FILHO para a mae que tem conta propria e e
  responsavel dele no mesmo tenant — senha nao bate, ela fica trancada fora da
  propria conta. Virou consulta em DUAS etapas, com o CPF proprio vencendo.
- **`void promise` morre na Vercel.** A "regeneracao ansiosa" do PDF e o sync
  com a EA usavam `void`, que pode ser congelado junto com a invocacao assim que
  a resposta sai — nem o `.catch` roda. Trocado por `afterResponse`.
- **Gate so no painel nao e gate.** `GUARDIAN_REQUIRED` de aluno existente
  existia em `/api/painel/vendas` mas nao em `/api/admin/vendas` nem na recompra
  `/api/aluno/comprar` — as duas cobravam no CPF do menor. Ao criar um gate,
  varrer TODAS as portas equivalentes.
- **O compilador nao pega pagador montado a mao.** O rename `student*` -> `payer*`
  quebrou os call sites tipados, mas tres lugares montavam `payer: {...}` como
  literal (`admin/vendas` MP, `aluno/comprar` MP, carne MP em `installments/plan`)
  e passaram batido. Varredura por `payer: {` / `cpfCnpj:` / `identification:`
  quando o dono de um dado muda.
- **`asaasCustomerId` da matricula tinha precedencia sobre o do pagador**: uma
  1a tentativa feita antes de a ficha ganhar o responsavel carimbava o customer
  do MENOR, e a cobranca seguinte era lancada nele com o CPF da mae no
  `creditCardHolderInfo`. `payerKind` agora invalida esse cache.
- **Fila sem saida de dispensa.** So havia "Corrigir": os 17 alunos com
  certificado — a maioria correta — ficariam presos na lista para sempre, e a
  unica forma de limpar seria submeter uma correcao falsa. O PATCH existia e
  nenhum componente o chamava.
- Outros: P2002 ao gravar o CPF do filho que ja tem cadastro proprio virava 500
  generico; `markTitularityReviewed` gravava auditoria sem `tenantId` (sumia da
  visao por unidade); `PATCH /api/aluno/perfil` aceitava `nascimento: 2999-12-31`
  sem a sanidade que a regra compartilhada ja tinha; o parentesco nao voltava
  para o select (a coluna guarda o ROTULO, o select espera a CHAVE), fazendo todo
  salvamento de menor falhar; e o modulo que reescreve documento oficial era o
  unico sem teste — agora tem, verificado por mutacao.
- **Cuidado de bundle:** `signals.ts` consulta o banco, entao os rotulos e tipos
  vivem em `titularity/types.ts`. Importar valor de um modulo que toca Prisma num
  componente `"use client"` arrasta o driver `pg` para o navegador e quebra o
  build com "Can't resolve 'dns'".

### Aproveitamento do certificado + progresso sob demanda (2026-08-14)

Aluno concluiu na plataforma de aulas, nao conseguiu emitir o certificado, e
quando o SUPER_ADMIN forcou a emissao o documento saiu com "Aproveitamento:
67%". Dois defeitos independentes, ambos com a mesma raiz: **o progresso e uma
copia pull-only e ninguem a atualizava na hora que ela decidia algo**.

- **A EA nao tem webhook.** O progresso so entrava por (a) cron diario das 07:00
  e (b) o aluno abrir `/aluno/cursos`. **Nenhuma tela de emissao** — admin,
  painel ou botao do aluno — puxava da EA antes de decidir "concluiu?". O
  operador via CONCLUIDO na plataforma de aulas e EM_ANDAMENTO aqui, com ate 24h
  de defasagem. Agora as tres portas chamam `syncStudentProgressBestEffort`
  (`lib/students/progress.ts`); na rota do aluno so no caminho de RECUSA, para o
  caso feliz nao pagar a latencia. O cache de 5 min da propria
  `syncStudentProgress` evita martelar a EA.
- **"Aproveitamento" nunca foi nota** — era `Enrollment.progressPercent`, o
  percentual de AULAS ASSISTIDAS, e era lido **ao vivo na hora de gerar o PDF**.
  Num documento oficial isso da (1) contradicao — "certificado de CONCLUSAO" que
  imprime 67% — e (2) instabilidade: como o PDF e regerado sob demanda, o mesmo
  certificado imprimia numeros diferentes a cada download. A EA marca CONCLUIDO
  **abaixo de 100%** (o contrato documenta `CONCLUIDO / 95%`; ha certificados em
  producao com 88% e 97%), entao nem sincronizar resolveria. Agora e a constante
  `CERTIFICATE_COMPLETION_PERCENT = 100` e o `progressPercent` foi removido de
  ponta a ponta do pipeline de render (`render-data` → `generate-pdf` →
  3 layouts → sample). O preview HTML **ja** mostrava 100% fixo: o PDF era o
  divergente.
- **Mudanca no CODIGO de render nao invalidava PDF gerado.** `freshness.ts` so
  comparava fontes de DADOS (template, tenant, settings) — nenhuma se move
  quando o que muda e o layout. Sem isso a correcao acima so alcancaria
  certificados novos. Entrou `RENDER_REVISION_AT`: PDF gerado antes dela e
  desatualizado. **Ao mexer no codigo de render, bumpe a data para o inicio do
  dia SEGUINTE** — ancorar em "agora" deixaria os PDFs gerados na janela entre
  commit e deploy marcados como atuais, preservando o conteudo errado. A
  comparacao fica FORA do try/catch, senao o fallback "assume atual" de falha de
  leitura a engole.
- **Botao "Atualizar progresso"** em `/aluno/cursos`
  (`components/aluno/sync-progress-button.tsx` →
  `POST /api/aluno/progresso/sincronizar`): o aluno puxa na hora em vez de
  esperar o proximo sync. **Passa `force: true`** — os dois atalhos de 5 min de
  `syncStudentProgress` (Redis + `progressSyncedAt`) sao otimizacao para chamada
  AUTOMATICA; num pedido EXPLICITO eles tornariam o botao um placebo. O
  contrapeso e rate limit por ALUNO (`alunoSyncProgresso`, 4/5min), nao por IP —
  o custo e da conta dele e alunos atras do mesmo IP nao podem se estrangular.
- **O botao fala com as DUAS fornecedoras.** `syncStudentProgress` so cobre a
  EA; 112 das 629 matriculas em producao sao LMS e ficariam com um botao mudo.
  Entrou `syncLmsStudentProgress` (`lib/lms/student-progress.ts`), que pergunta
  `GET /students/:ref` — o delta `day-update` nao serve para "atualizar agora"
  porque o cursor e GLOBAL: forca-lo por um aluno reprocessaria a base inteira e
  avancaria o cursor de todos. O mapeamento progresso→matricula foi extraido
  para `lib/lms/apply-progress.ts` e e o MESMO nos dois caminhos: duplicar faria
  as metades divergirem em silencio (bastaria uma esquecer `evaluatePaceGate`
  para o aluno parcelado ficar com o curso inteiro liberado). A rota tolera
  falha de cada fornecedora separadamente — a EA cair nao pode impedir o aluno
  de LMS de atualizar.
- **Descobertas de producao:** `certificate_auto_issue` esta **false** (toda
  emissao e manual — o `toIssueCert` do sync nunca dispara) e
  `certificate_min_percent` e **90**, nao o default 80 do schema. E o cron de
  progresso so varre `status: ACTIVE`: emitir o certificado promove a matricula
  a COMPLETED e ela sai da fila de sync para sempre. Nao e mais problema para o
  documento (que agora nao le progresso), mas congela o "% concluido" exibido em
  `/aluno/cursos`.

### Cancelamento automatico por inadimplencia (2026-08-21)

A unidade que fica **7 dias** com a mensalidade vencida agora e CANCELADA
sozinha. Antes o relogio parava na suspensao (D+3) e ninguem cancelava: em
21/08 havia 23 unidades vencidas, uma delas ha 29 dias, todas suspensas e
acumulando.

- **A regua e uma so:** `src/lib/tenants/overdue-policy.ts` (PURO) decide
  suspender (D+3), avisar (D+5) e cancelar (D+7). O motor
  (`overdue-sweep.ts`) executa e a rota do cron virou casca. O relogio das
  tres decisoes e o MESMO — o `dueDate` da cobranca mais antiga em aberto, em
  dia civil brasileiro (`daysUntilBrDay`). Contar a partir da SUSPENSAO faria
  o prazo depender de quando o cron rodou; contar em UTC cancelaria com 6 dias
  e 21 horas.
- **O cancelamento nunca vem antes da suspensao:**
  `cancelAfterDays = max(7, gracePeriodDays)`. Ha unidade em producao com
  carencia 15 — sem o `max` ela pularia direto de "vendendo" para "cancelada".
- **Cancelar e irreversivel, entao pede TRES provas** (suspender nao pede
  nenhuma — se desfaz sozinho no `reactivate-paid`): (1) a cobranca nao tem
  `paidAt`/`markedPaidAt`, campos que sobrevivem a reescrita de status pelo
  webhook; (2) nao existe cobranca de ciclo POSTERIOR ja paga — se ha, a linha
  velha e residuo de reconciliacao, nao divida; (3) o Asaas CONFIRMA na hora
  que ela segue em aberto. Asaas fora do ar, id que nao resolve (`ins_` de
  mensalidade parcelada) ou status inesperado (estorno, chargeback) **adiam**
  o cancelamento. Fail-closed: adiar custa 6h, cancelar errado custa um cliente.
- **O padrao de bloqueio de aluno e OPOSTO nos dois eventos — nao unifique.**
  Na SUSPENSAO, politica ausente => bloqueia (comportamento que ja rodava; a
  suspensao se desfaz ao pagar). No CANCELAMENTO, politica ausente => MANTEM o
  aluno (`shouldBlockStudentsOnCancel`), igual ao cancelamento manual e ao em
  lote: o aluno pagou o curso dele.
- **Zero migration e zero job novo.** O aviso de D+5 reusa
  `TenantPaymentReminder` com `offsetDays` NEGATIVO (`-5` = 5 dias DEPOIS do
  vencimento; os lembretes pre-vencimento sao 5/2/0) — a PK composta e o que
  impede aviso duplicado quando o pg_net re-tenta. E a varredura mora no
  `pmb-sweep-tenants-overdue`, que ja roda de 6 em 6 horas: cron novo teria que
  ser agendado a mao no pg_cron e ja aconteceu de dois ficarem de fora.
- **`?dryRun=1`** na rota do cron calcula tudo e devolve QUEM SERIA cancelado
  sem escrever, sem falar com o Asaas e sem avisar ninguem. E como se confere
  um backlog antes da primeira execucao.
- **Saida por unidade:** `cancellationPolicy.autoCancel: false` (negociacao em
  curso) e `autoCancelAfterDays` (prazo proprio, nunca abaixo da carencia),
  editaveis em /admin/revendedores/[id]. De quebra, o formulario mostrava
  carencia **15** para unidade sem politica enquanto a varredura suspendia em
  **3** — quem abrisse a tela e salvasse sem mexer em nada triplicava o prazo
  sem querer (foi o que aconteceu com `vocequervocepode`, a unica unidade com
  politica gravada). O default da tela agora e o do cron.
- **Trilha:** `audit_logs` com `action: "tenant.cancel"`, `actorRole: "SYSTEM"`
  e `payloadAfter.origem = "auto_inadimplencia"` — distingue das linhas do
  cancelamento manual (`origem` ausente) e do lote (`lote_nunca_ativou`).
- **Decisao do dono (21/08):** a regra vale para o PASSADO. Na primeira
  execucao, as 13 unidades ja passadas de 7 dias sao canceladas — 11 delas ja
  foram pagantes. Isso **move o churn** (ao contrario do cancelamento em lote
  das "nunca ativou"): essas 11 estao na base do churn e migram de suspensa
  para cancelada.
- Testes: `overdue-policy.test.ts` (regua) e `overdue-sweep.test.ts` (as provas
  antes de destruir, o dry-run e a falha parcial), verificados POR MUTACAO —
  trocar o `max` por `??`, remover a guarda de ciclo pago ou inverter o padrao
  de bloqueio da suspensao derruba o teste correspondente.

### Cursos de autoria da unidade + split Asaas (2026-08-21)

O catalogo era global e de dono unico: `Course` nao tinha `tenantId`, nem
`createdByUserId`, nem marcador de origem — cursos so entravam por sync das duas
fornecedoras e **nao existia POST de criacao de curso em lugar nenhum**, nem no
/admin. A unidade passa a PRODUZIR curso proprio, escolher em quais vitrines ele
e vendido e definir a comissao de quem vender. Isso traz o problema que o repo
nunca teve: **uma venda cujo dinheiro pertence a mais de um tenant**.

**As regras de dinheiro** (decisoes do dono, travadas na conversa):

```
Vitrine do proprio autor  -> produtor 100%, sem split e SEM os 5% da PMB
Vitrine de outra unidade  -> vendedor c% (>=10) - PMB 5% - produtor o resto
Vitrine PMB               -> a PMB e a vendedora: retem c% + 5%
```

- **Quem EMITE a cobranca e a vitrine que vendeu.** Escolha do dono, e a mais
  segura: `Payment.tenantId` continua sendo o tenant da matricula, entao o
  invariante de `assert-tenant-gateway.ts` (escrito depois do vazamento de
  receita do Polo Betim) **vale sem nenhuma excecao**. O dinheiro cruza tenants
  so pelas linhas de split, que sao explicitas e auditaveis.
- **Tres modos de preco**, o produtor escolhe por curso: `FIXED` (preco igual em
  toda vitrine), `MIN_PRICE` (piso; produtor e vendedor sobem juntos) e
  `MIN_PRODUCER_NET` (o produtor recebe um valor fixo e a diferenca e toda do
  vendedor — preco minimo passa a ser `authorAmount / (1 - c - f)`, senao a
  comissao minima nao caberia).
- **Desconto sai do bolso de quem vende, nunca do produtor:** a parte do produtor
  e calculada sobre o preco DE TABELA e a taxa da PMB sobre o valor COBRADO. Sem
  isso um cupom de 50% faria o produtor pagar por uma promocao que nao autorizou.
  `computeSplit` recusa (`DISCOUNT_EXCEEDS_SELLER_SHARE`) quando o desconto
  zeraria a parte do vendedor.
- **`percentualValue` do Asaas incide sobre o LIQUIDO**, nao sobre o bruto: a
  tarifa do gateway acaba rateada proporcionalmente entre os tres. Foi escolha —
  percentual nunca estoura o liquido; `fixedValue` pode, e ai o split e BLOQUEADO
  por divergencia. Os valores em `CourseSaleSplit.amount` sao o ESPERADO sobre o
  bruto, e o creditado sai alguns centavos menor.

**Arquitetura:**

- **Autoria mora no `Course`, nao em tabela nova** (`authorTenantId` null = todo
  o catalogo da PMB), pelo mesmo motivo de `precoVitrineMain`/`visibilityMode`:
  os syncs preservam curadoria de proposito. `Course.distribution` e a escolha do
  AUTOR; `visibilityMode` continua sendo a curadoria da PMB — eixos independentes,
  os dois filtram.
- **Ripple do unique:** `@@unique([provider, nome])` virou
  `@@unique([provider, authorTenantId, nome])` + **indice unico PARCIAL**
  (`WHERE author_tenant_id IS NULL`) preservando a garantia do catalogo da PMB —
  Postgres trata NULL como distinto num composto. Como o Prisma nao faz
  `findUnique` com coluna nula, `sync.ts` e `seed.ts` passaram a `findFirst`.
  A clausula `authorTenantId: null` no match do sync EA e a trava que impede o
  **sequestro**: sem ela, uma unidade publicando "Excel Basico" teria o curso
  reescrito com os dados do feed todo dia as 6h.
- **Motor PURO** em `src/lib/course-authoring/split.ts` — o simulador do painel
  importa dali, entao o servidor e a tela nunca divergem no numero prometido.
  `sellerIsProducer` devolve `lines: []`: a regra dos 100% mora num lugar so.
- **Snapshot congelado** em `Enrollment.authorSplitSnapshot`: um carne paga ao
  longo de meses e o produtor pode editar a comissao no meio. As linhas
  realizadas ficam em `CourseSaleSplit`, `@@unique([paymentId, role])`.
- **`asaasSplitsForEnrollment(enrollmentId)`** e o que faz o rateio ser
  impossivel de esquecer: quem monta a cobranca chama com o id da matricula e
  recebe o array. Esquecer o split e o pior defeito da feature — a venda
  acontece, o aluno recebe o curso e o produtor simplesmente nunca e pago, sem
  erro em lugar nenhum.
- **`fulfill.ts` virou transacao INTERATIVA** nos dois `payment.create` (as
  linhas precisam do id do Payment). Sao 3 operacoes — longe do lote que ja
  quebrou sobre o pooler. Herda as tres camadas de idempotencia existentes.
- **Gate unico `authoredSaleGate`** nas oito portas de venda, pela licao do
  `GUARDIAN_REQUIRED` (nasceu numa rota so e duas portas seguiram cobrando
  errado por meses). Ele forca `gateway = ASAAS` ignorando o
  `tenantCheckoutMode` da loja — cair no MP calado venderia SEM repasse — e
  responde **503 `SPLIT_GATEWAY_REQUIRED`** quando a loja nao tem Asaas.
- **Carteira Asaas** (`Tenant.asaasWalletId`) descoberta por `GET /v3/wallets/`
  com a chave que a unidade JA conecta: ninguem digita walletId (um caractere
  trocado mandaria dinheiro para um desconhecido). Dois gates de alturas
  diferentes: RECEBER exige so a carteira; VENDER curso de terceiro exige
  `asaasConnected` + `asaasWebhookToken`, porque a cobranca nasce na conta dela.
- **Distribuicao:** `ensureTenantCourses` ganhou filtro de origem — sem ele o
  curso da unidade A entraria na vitrine de B, C e D ainda em rascunho. Curso da
  rede so alcanca quem tem carteira: melhor nao aparecer do que aparecer e
  quebrar no checkout. Nasce VISIVEL e a unidade desativa (decisao do dono).
- **Preco validado na ESCRITA do `TenantCourse`**, individual e em massa — nao so
  no checkout. Validar so no checkout deixa a loja num estado pior que erro: o
  curso listado, a unidade achando que vendeu por R$ 1, e a recusa aparecendo com
  o aluno na tela de pagamento.
- **Webhooks `PAYMENT_SPLIT_*` ganharam handler.** Ja estavam no union de tipos e
  caiam no `default:` silencioso. O que mais importa e o `DIVERGENCE_BLOCK`: o
  Asaas da **2 dias uteis** para ajustar antes de CANCELAR o split e liberar o
  valor inteiro ao emissor — passado o prazo em silencio, o produtor perde o
  dinheiro daquela venda. O alerta vai ao SUPER_ADMIN **sem `category`**, para
  nao poder ser silenciado por preferencia.
- **Permissoes:** par novo `cursosAutorais.view/manage` nos DOIS catalogos.
  Familia propria de proposito — definir o preco de um curso da PMB na vitrine
  nao deveria habilitar publicar produto proprio na rede, com comissao e
  repasse. No /admin **nao entra em `SUPER_EXCLUSIVE`** (dispararia o teste de
  igualdade exata de `SUPER_EXCLUSIVE_BY_PRESET`); e curadoria, nao escalada.

**Limites deliberados da v1:**

- **Curso de autoria de terceiro VENDE SOZINHO** — nao entra em venda
  multi-curso nem em pacote (bloqueado tambem na criacao/edicao de pacote). O
  split e da cobranca INTEIRA: num carrinho misto o percentual do produtor
  atingiria o curso da PMB. Mesma trava de "curso mensal so e vendido sozinho".
- **Sem aprovacao da PMB** (decisao do dono): o produtor publica direto. A
  contrapartida e reativa — aba "Cursos das unidades" em /admin/catalogo com
  acao de PAUSAR, que tira das vitrines e **nao mexe em matricula** (cortar quem
  ja pagou puniria a pessoa errada).
- **Certificado** continua saindo com a marca do tenant VENDEDOR. Para curso de
  autoria de terceiro isso merece decisao do dono (autor? vendedor? ambos?).
- **Unidade que perde a carteira** com cursos de terceiro ja na vitrine: o
  checkout fecha com `SPLIT_GATEWAY_REQUIRED`. Varredura que oculta esses cursos
  fica como follow-up.

**Dependencia fora deste repo:** as aulas ficam no LMS, que precisa expor
`POST /api/v1/courses` (casca com dono), `PATCH /api/v1/courses/:id`,
`POST /api/v1/sso/author-token` e `ownerTenantExternalId` no catalogo — contrato
em `docs/api/lms-autoria-unidade.md`. **Regra de ouro do lado de la: curso com
dono NAO entra no catalogo global** (o PMB o gravaria como curso da PMB e ele
seria distribuido de graca para a rede). Enquanto `LMS_AUTHORING_ENABLED` nao for
`true`, a camada comercial inteira funciona e o curso fica em RASCUNHO —
publicar sem conteudo faria a venda ser cobrada e o provisionamento falhar com o
aluno ja tendo pago.

**Deploy:** migration `20260821_course_authoring` (aditiva, idempotente, sem
backfill — `author_tenant_id` nasce null = catalogo da PMB). Envs opcionais:
`ASAAS_PMB_WALLET_ID` (sem ela, descoberta pela conta-mae a cada checkout) e
`LMS_AUTHORING_ENABLED`. **Prototipar o split em SANDBOX antes de producao** —
cobranca avulsa com 2 linhas, carne 3x conferindo o split por parcela, carteira
inexistente (tem que falhar no ato, nao na liquidacao) e estorno conferindo a
reversao automatica.

### Cancelamento por inadimplencia EXECUTADO + cron diario (2026-08-24)

Primeira execucao real da regra escrita em 21/08 — ela nunca tinha rodado,
porque a integracao Git da Vercel estava caida e producao servia codigo velho.

- **13 unidades canceladas**, todas SUSPENDED, entre 9 e 32 dias de atraso
  (~R$ 2.994/mes que ja nao entrava). Dry-run rodado antes: bateu exatamente com
  a lista, zero adiadas. Cada uma com `audit_logs` action `tenant.cancel`,
  `actorRole: SYSTEM`, `payloadAfter.origem = "auto_inadimplencia"`.
- **Nenhum aluno foi tocado** — politica ausente => MANTEM o acesso
  (`shouldBlockStudentsOnCancel`). Os 8 bloqueados ja estavam desde a SUSPENSAO
  (a regra e oposta la, de proposito). Verificado por `updated_at`.
- **Zero cobranca OVERDUE restante**; as abertas foram para `DELETING`
  aguardando o webhook `PAYMENT_DELETED`. O `asaas_subscription_id` continua
  gravado por historico — a assinatura foi cancelada no Asaas, e isso e
  pre-requisito: `cancelTenant` aborta ANTES de mexer no banco se o Asaas falhar.
- **`pg_net` estoura o timeout de 60s dele** enquanto o sweep ainda roda (13
  cancelamentos x 2-4 chamadas ao Asaas). O job COMPLETA na Vercel (maxDuration
  300), mas `net._http_response` fica com `status_code` null. Para conferir o
  resultado, olhe o BANCO (status das unidades / `audit_logs`), nao a resposta
  HTTP.

**Cron passou de `0 */6 * * *` para `1 3 * * *`** = 00:01 de Brasilia. O horario
nao e decorativo: a regua conta em DIA CIVIL BRASILEIRO, e as 03:01 UTC o dia ja
virou no Brasil. `1 0 * * *` (00:01 UTC = 21:01 BRT do dia anterior) avaliaria o
dia brasileiro ANTERIOR e atrasaria tudo em um dia. Efeito colateral aceito: a
SUSPENSAO (D+3) sai pelo mesmo job e agora pode demorar ate 24h.

### Autoria de curso pela unidade LIGADA em producao (2026-08-24)

A camada comercial estava pronta desde 21/08, mas o LMS nao tinha nada do
contrato: `POST /api/v1/courses` e `PATCH /courses/:id` respondiam **405**,
`POST /sso/author-token` **404**, e `Course` **nao tinha dono**. A area
`/autoria` de la era `requireAdmin()` — o proprio codigo dizia "nao e escopada
por revenda". Com a flag ligada naquele estado, a unidade criaria a casca e o
botao "Conteudo" nao abriria nada.

**Os dois lados agora:**

- **LMS** (`Area do Aluno PMB`, repo separado): `Course.ownerTenantExternalId`
  (null = catalogo da plataforma), os tres endpoints, o campo no
  catalogo/detalhe/`day-update`, e a sessao `role: "author"` presa a UM curso
  (`src/lib/authoring-scope.ts`). **A invariante:** passa so quando
  `ownerTenantExternalId === session.tenantExternalId` **E**
  `id === session.courseId`. A primeira isola o catalogo da plataforma POR
  CONSTRUCAO — la o dono e `null`. O curso dono e resolvido subindo pela
  RELACAO da entidade (aula → modulo → curso), nunca pelo `courseId` do
  FormData, que e do cliente.
- **PMB**: `Tenant.courseAuthoringEnabled` — habilitacao COMERCIAL por unidade,
  aba "Vitrine & extras" de /admin/revendedores/[id], molde de
  `canSellResellers`. **Nao se confunde com `cursosAutorais.*`**, que e
  permissao de PESSOA: o preset do dono e `owner: ALL`, entao sem a chave da
  unidade TODA revenda produziria curso. Guard unico em
  `lib/course-authoring/module-gate.ts`.

**Publicar e BLOQUEANTE, nao best-effort.** O LMS recusa (409) curso sem aula,
matriz ou categoria. O PMB espelhava isso em `afterResponse(...).catch(log)`:
a recusa virava uma linha de log e o curso VAZIO ia para a vitrine — o aluno
compraria e cairia num curso sem conteudo. Hoje o publicar AGUARDA o LMS e
acontece ANTES da escrita na vitrine (409 devolve a mensagem DELE, que lista o
que falta; qualquer outra falha e 502 fail-closed). Despublicar segue
best-effort de proposito: tirar de venda e a direcao SEGURA, e bloquear
impediria o produtor de tirar do ar o proprio curso porque a outra ponta caiu.

**Validado ponta a ponta em producao (24/08)**, com a unidade
`vocequervocepode`: casca com dono criada; curso fora do catalogo global
(rascunho); token recusado para outra unidade (403); SSO de uso unico (replay →
`/login?erro=autoria`); upload de capa gravando no MinIO; upload, presign e
complete recusados (403) para curso e aula de outro dono; sem sessao 401.

**Dois defeitos so apareceram na validacao, nao nos testes:** o SSO mandava o
autor para `/curso-autoria/<id>` (o grupo `(autoria)` nao entra na URL — o
editor e `/autoria/curso/<id>`), entregando um 404 com o token ja queimado; e as
telas administrativas mandavam o autor para `/login`, beco sem saida para quem
nao tem senha la (agora `requireAdminArea()` devolve ao curso dele).

**Cuidado de deploy — a integracao Git da Vercel caiu em silencio.** Entre 21 e
24/08 o projeto ficou com `link: null`: push em main deixou de gerar deploy e
producao serviu codigo velho por 3 dias enquanto 4 commits "subiam". **Push
aceito no GitHub NAO prova deploy** — conferir
`gh api repos/<owner>/<repo>/deployments --jq .[0]`. Religado com
`npx vercel git connect --yes`.

### Identidade da unidade dentro do LMS (2026-08-24)

So `brandName` e `logoUrl` chegavam a plataforma de aulas: o aluno via a logo da
unidade sobre a paleta VERDE da PMB, e — desde a autoria — a propria unidade
editava o curso dela numa casca com a marca da plataforma ("Minha Escola").

- `TenantLink` ganhou `primaryColor`/`secondaryColor` (aditivo, `""` = padrao),
  enviados por `PUT /api/v1/tenants/:id`.
- **O mapeamento e COPIADO da vitrine do PMB** (`lms: src/lib/tenant-theme.ts` x
  `pmb: src/app/loja/layout.tsx`): a primaria colapsa a rampa
  `--color-pmb-green*`, a secundaria colapsa `--color-pmb-gold*`. As duas
  aplicacoes compartilham a MESMA paleta — repetir o mapeamento e o que faz a
  unidade ver a MESMA cor nos dois lugares. Sobrescrever a RAMPA (e nao so
  `--primary`) e o que re-skina a casca: a barra lateral da autoria pinta com
  `--color-pmb-green-700` direto.
- Vale para a autoria E para a area do aluno, incluindo o `<head>`
  (`<title>`, `application-name`, `theme-color`) — a aba dizia "Minha Escola"
  enquanto a pagina ja mostrava a marca da unidade.
- **A cor vem de outro sistema e entra dentro de `<style>`**: `safeHex` so aceita
  `#RGB`/`#RRGGBB` e DESCARTA o resto. Um `}` solto fecharia a regra e o resto
  viraria CSS arbitrario na pagina de todo aluno daquela revenda.
- **Campo AUSENTE preserva; `""` limpa.** Das quatro chamadas de
  `syncTenantBrandingToLms`, tres nao conhecem as cores (upload de logo x2 e
  criacao da revenda) — por isso `?? undefined` e nao `?? ""`, senao trocar a
  logo apagaria a identidade. Ha teste, verificado por mutacao.
- **Backfill feito (88/88)**: a cor so chegaria ao LMS quando a unidade salvasse
  a Personalizacao. Decisao do dono: empurrar todas, iguais a vitrine —
  inclusive as 43 que nunca escolheram cor e estao no **azul padrao do banco**
  (`#2563eb`), que ja e o que a vitrine delas mostra. (Cuidado: o default do
  schema e AZUL, nao o verde da plataforma — por isso `isCustomColor` compara com
  `#025918` e praticamente toda unidade conta como "custom".)

### Responsabilidade pelo conteudo de curso de autoria (2026-08-24)

O catalogo passou a ter DUAS origens que ninguem distingue de fora: curso da PMB
(curado) e curso que uma unidade produziu por conta propria. Tres superficies
passam a dizer de quem e o conteudo — e de quem NAO e:

- **Vitrine (PMB e revenda)** — `AutoriaNote`, bloco completo na pagina do curso:
  responsabilidade integral da unidade pelo material E pela autoria,
  originalidade, veracidade, atualizacao e adequacao legal (incl. direitos
  autorais e de imagem); isenta NOMINALMENTE as tres marcas e diz para quem
  reclamar. Componente SEPARADO da `RegulamentacaoNote` de proposito: aquela e
  texto juridico fechado sobre curso livre e vale para TODO curso.
- **Certificado** — linha discreta no VERSO, dentro do corpo da fundamentacao
  legal (6.8pt). A FRENTE e do aluno: uma isencao ali mudaria o tom do documento
  que ele mostra a um empregador. `authorName` != `unidade` (quem produziu vs.
  quem emitiu/vendeu). **Exigiu bump de `RENDER_REVISION_AT` para 2026-08-25** —
  sem ele a nota so sairia em certificados NOVOS.
- **Area do aluno (LMS)** — "Conteudo de {unidade}" como item de META no card,
  por ULTIMO. Bloco juridico em cada card competiria com o ato de estudar.

**Nenhuma das tres renderiza quando o curso e da PMB** (a esmagadora maioria):
uma nota dizendo que a plataforma "nao se responsabiliza" impressa num curso da
PROPRIA plataforma seria pior que nota nenhuma. Verificado por mutacao nas tres.

### Regras pedagogicas: a unidade define como as aulas abrem (2026-08-25)

Antes, o aluno navegava livre pelo curso: as unicas travas eram a PROVA (que
para a sequencia) e a COTA DE PARCELAMENTO. A unidade passa a definir tres
eixos INDEPENDENTES — ordem, ritmo e horario — com padrao por unidade e
override por curso NAQUELA vitrine.

- **Motor PURO e DUPLICADO de proposito.** `src/lib/pedagogia/{policy,gate,
  br-time}.ts` no PMB e `src/lib/pedagogia.ts` no LMS, com os MESMOS 30 testes
  e os mesmos nomes de caso — e o que faz a divergencia aparecer. Precedente:
  `tenant-theme.ts`. O LMS conhece a grade e decide aula a aula sem uma chamada
  de rede por clique; o PMB precisa das mesmas respostas para a tela de
  configuracao e para a janela na fornecedora legada.
- **Alcance HONESTO, e e a decisao mais importante da feature.** Em producao,
  448 das 589 matriculas vivas estao na fornecedora legada, cuja API nao tem
  gate por aula, nem progresso por aula, nem webhook — o unico controle e
  `usuarios/editar` ativo/bloqueado, **por login**. Entao: os tres eixos valem
  na plataforma propria; **so o horario** alcanca a legada, e fechando o acesso
  INTEIRO do aluno. A tela do painel diz isso em numeros antes de a unidade
  configurar — mas **sem nomear a fornecedora**, que a invariante de sigilo
  (`students/course-access.test.ts`) proibe: ela fala do EFEITO por curso.
- **`Student.status` nao tinha espaco para um terceiro motivo.** BLOQUEADO ja e
  inadimplencia e DEVEDOR ja e a cota; reusar qualquer um faria a liberacao da
  manha devolver acesso a quem deve. Dai a coluna `scheduleBlockedAt` como
  DISCRIMINADOR: `setStudentScheduleBlock` so bloqueia quem esta ATIVO e so
  libera quem carrega a marca.
- **A corrida que quase passou:** enquanto o aluno esta travado pelo relogio, a
  unidade pode ficar inadimplente — e `blockTenantStudents` PULA quem ja esta
  BLOQUEADO, entao ninguem carimba. Liberar as 08:00 devolveria acesso de
  unidade suspensa. Por isso `hasStrongerBlock` + o estado `handoff`: soltamos a
  marca e deixamos o bloqueio de pe. Testado e VERIFICADO POR MUTACAO (5/5).
- **A janela nao toca no LMS**, so na legada: la ela e aplicada aula a aula pelo
  proprio LMS, que e mais fino. Duas travas disputando a decisao deixariam o
  aluno preso quando uma perdesse a corrida.
- **REVISAO nunca e barrada** por ordem, gotejamento ou cota — a cota limita o
  AVANCO, e travar o que o aluno ja conquistou seria apaga-lo. A JANELA, sim,
  vale para a revisao: ela e sobre QUANDO se estuda. E ela vem PRIMEIRO na
  ordem de avaliacao, senao o aluno fora do horario receberia "conclua a aula
  anterior" — conselho que tambem nao funcionaria.
- **`parsePolicy` resolve todo valor invalido para o lado MENOS restritivo** e
  nunca lanca: e lido no caminho quente do player, e um JSON corrompido travaria
  quem pagou. Cota `0` vira "sem cota"; janela invertida e descartada INTEIRA
  (guardar meia janela fecharia 24h); os sete dias marcados viram `[]`. O
  formulario usa um schema SEPARADO que RECUSA com mensagem — normalizar calado
  faria a unidade salvar "das 22h as 2h" e nao travar ninguem.
- **`null` no curso HERDA, e herdar se propaga mandando `null`** ao LMS (limpa o
  override da matricula). Mandar a politica da unidade resolvida congelaria a
  matricula na regra da epoca, e editar o padrao depois nao a alcancaria.
- **O gate DURO mora em `lessonAccess`** (LMS), o funil por onde passam
  progresso, anotacoes e comentarios — rota nova herda a regra sem fazer nada. A
  matricula chega PRONTA do chamador: recarrega-la sairia uma vez por
  salvamento de posicao do player, o endpoint mais chamado do sistema.
- **Fuso:** o LMS nao tinha nenhum helper de horario brasileiro. `brOffsetMinutes`
  e derivado do Intl e nao constante `-180` — o Brasil ja teve horario de verao,
  e a constante errada deslocaria toda janela em uma hora sem ninguem perceber.
- **Permissao `pedagogia.view/manage`** (familia propria): precificar e decisao
  comercial, definir como o aluno estuda e pedagogica, e a unidade costuma
  entregar as duas a pessoas diferentes. A regra alcanca aluno que JA COMPROU —
  por isso toda alteracao vai para `audit_logs` com antes e depois.
- **Deploy:** migration `20260825_pedagogia` (aditiva, idempotente, sem backfill
  — `pedagogy_policy` nasce NULL = comportamento de hoje). No LMS, `db push`
  cria as duas colunas com default `""`. Falta **agendar `pmb-pedagogia-janela`
  no pg_cron** (job novo NAO se agenda sozinho — conferir `cron.job` apos o
  deploy) e rodar `?dryRun=1` antes da primeira execucao real.

### Bugs conhecidos (pendentes)

- **Middleware file convention deprecado** no Next 16 (usar `proxy` em vez de `middleware`).
- Consultor (TenantMember) nao popula `session.user.tenantId` no JWT — cap de desconto e validado server-side via lookup de TenantMember na API.
- `npm run build` local para em "Collecting page data" por falta de `DATABASE_URL`: as envs Sensitive da Vercel nao descem no `vercel env pull`. Compile + typecheck passam; para fechar o build localmente, exporte um `DATABASE_URL` qualquer.

### Proximas etapas

1. **Rodar `npx prisma db seed`** contra o banco atual para criar as novas credenciais.
2. **Executar checklist `docs/qa/PERFIS.md`** — validar fronteiras end-to-end por papel.
3. **Rollout design system (055-060)** — aplicar estilo PMB em todo o app (issues ja abertas).

## Stack

- **Next.js 15+** (App Router) + **TypeScript**
- **Tailwind CSS 4+** + **shadcn/ui**
- **Prisma 6+** + **PostgreSQL** (Supabase)
- **NextAuth.js v5** (Auth.js)
- **Upstash Redis** (cache de tenant + rate limiting)
- **Vercel** (hospedagem + wildcard domains)
- **Zod** (validacao) + **Zustand** (state) + **React Email + Resend** (emails)

## Workflow: SPEC → BREAK → PLAN → EXECUTE

Este projeto segue um workflow estruturado. **NUNCA comece a codificar sem seguir estes passos.**

1. **SPEC** — Toda funcionalidade esta documentada em `docs/SPEC.md` (paginas, componentes, comportamentos)
2. **BREAK** — A SPEC foi quebrada em 54 issues individuais em `issues/` (proto → infra → behavior → integration → design)
3. **PLAN** — Antes de codificar, use `/plan NNN` para ler a issue, docs de referencia e planejar
4. **EXECUTE** — Use `/execute NNN` para implementar seguindo o plano

### Comandos Disponiveis

| Comando | O que faz |
|---------|-----------|
| `/setup` | Inicializar projeto (deps, prisma, seed) |
| `/plan` | Planejar uma issue (ler docs, checar deps, produzir plano) |
| `/execute` | Executar uma issue (implementar codigo seguindo padroes) |
| `/status` | Ver progresso do projeto (issues completadas/pendentes) |
| `/next` | Sugerir proxima issue para executar |
| `/review` | Revisar codigo de uma issue completada |

### Ordem de Execucao

1. **Fundacao (020-029)**: Prisma, middleware, auth, layouts, API clients, crypto, cache, email
2. **Prototipos (001-019)**: UI com dados hardcoded, foco em design system
3. **Comportamentos (030-049)**: Conectar UIs a dados reais
4. **Webhooks/Cron (050-053)**: Processamento async
5. **Design premium (054+)**: Redesign de paginas publicas via Google Stitch

## Documentacao Essencial (LEIA antes de codificar)

| Arquivo | O que contem |
|---------|-------------|
| `docs/SPEC.md` | **SPEC COMPLETA**: Todas as 20+ paginas com componentes e comportamentos |
| `docs/references/architecture.md` | Padroes: thin client/fat server, behavior isolation, multi-tenant security, naming |
| `docs/references/design-system.md` | Tipografia, cores, componentes shadcn/ui, layouts, responsive, spacing |
| `docs/references/workflow.md` | Workflow SPEC→BREAK→PLAN→EXECUTE detalhado |
| `docs/architecture/profissionaliza-mais-brasil-blueprint.md` | Blueprint completo: atores, fluxos, integracao das 3 APIs, modelo de dados |
| `docs/architecture/DOMINIOS-GUIDE.md` | **CRITICO**: Multi-tenant com middleware, wildcard DNS, dominios custom via Vercel API |
| `docs/api/plataforma-parceira-api-completa.md` | Todos os 21 endpoints da API da plataforma parceira com params, responses e cuidados |
| `docs/design/STITCH-DESIGN-PLAN.md` | Design system, paleta, tipografia e prompts para 19 telas |
| `prisma/schema.prisma` | Schema completo do banco (12 models, pronto para `prisma migrate dev`) |
| `issues/` | **53 issues** individuais com tipo, dependencias, componentes e criterios de aceite |

## Estrutura de Pastas

```
profissionaliza-mais-brasil/
├── CLAUDE.md                        # ESTE ARQUIVO
├── .claude/
│   ├── settings.json                # Config do Claude Code
│   └── commands/                    # Slash commands
│       ├── setup.md                 # /setup — inicializar projeto
│       ├── plan.md                  # /plan — planejar uma issue
│       ├── execute.md               # /execute — executar uma issue
│       ├── status.md                # /status — ver progresso
│       ├── next.md                  # /next — sugerir proxima issue
│       └── review.md               # /review — revisar codigo
├── docs/                            # Documentacao (NAO APAGAR)
│   ├── SPEC.md                      # Spec completa (paginas, componentes, behaviors)
│   └── references/                  # Docs de referencia para agentes
│       ├── architecture.md          # Padroes de arquitetura
│       ├── design-system.md         # Sistema de design
│       └── workflow.md              # Workflow de desenvolvimento
├── issues/                          # 53 issues individuais (NNN-nome.md)
├── prisma/
│   └── schema.prisma                # Schema do banco (JA PRONTO)
├── public/
│   └── images/
│       └── logo.png                 # Logo da marca
├── .stitch/                         # Designs gerados pelo Google Stitch
│   └── designs/                     # HTMLs e screenshots das telas
└── src/                             # Codigo fonte (a ser criado)
    ├── app/                         # App Router Next.js
    │   ├── (auth)/                  # Login, register, forgot-password
    │   ├── (main)/                  # Site principal PMB
    │   ├── admin/                   # Painel Admin Master
    │   ├── painel/                  # Painel Revendedor
    │   ├── loja/                    # Vitrine multi-tenant
    │   └── api/                     # API Routes + Webhooks
    ├── components/
    │   ├── ui/                      # shadcn/ui
    │   ├── admin/                   # Componentes admin
    │   ├── painel/                  # Componentes revendedor
    │   ├── loja/                    # Componentes vitrine
    │   └── shared/                  # Compartilhados
    ├── lib/
    │   ├── prisma.ts                # Prisma client singleton
    │   ├── redis.ts                 # Upstash client
    │   ├── auth.ts                  # NextAuth config
    │   ├── crypto.ts                # AES-256-GCM para tokens MP
    │   ├── utils.ts                 # Helpers gerais
    │   ├── plataforma-cursos/         # Client API da plataforma parceira (form-data!)
    │   ├── asaas/                   # Client API Asaas
    │   ├── mercadopago/             # Client API MP
    │   └── tenant/                  # Resolver multi-tenant
    ├── hooks/                       # React hooks
    ├── stores/                      # Zustand stores
    ├── types/                       # Tipos globais
    └── middleware.ts                # MIDDLEWARE MULTI-TENANT (CRITICO)
```

## Arquitetura Multi-Tenant (MAIS IMPORTANTE DO SISTEMA)

A plataforma usa **dois dominios distintos** (proxy em `src/proxy.ts`):

| Hostname | O que renderiza |
|---|---|
| `profissionalizamaisbrasil.com.br` (e `www`) | Site PMB institucional + `/admin` + `/painel` + `/aluno` + `/loja` direto. **Subdominios aqui sao sempre reservados (www, app, api, ...) — nunca tenant.** |
| `livrecursos.com.br` (e `www`) | Landing dedicada a captacao de revendedores (rewrite para `/livrecursos`). |
| `{slug}.livrecursos.com.br` | Vitrine do revendedor `{slug}` (rewrite para `/loja/*`). |
| `dominio-custom.com.br` | Vitrine do revendedor que configurou dominio proprio (lookup por `customDomain` no banco). |

**Helpers obrigatorios em `src/lib/tenant/urls.ts`** — sempre use estas funcoes em vez de concatenar strings de dominio:

- `appDomain()` → `profissionalizamaisbrasil.com.br`
- `vitrineDomain()` → `livrecursos.com.br`
- `appUrl()` → `https://profissionalizamaisbrasil.com.br`
- `vitrineHost(slug)` → `{slug}.livrecursos.com.br`
- `vitrineUrl(slug)` → `https://{slug}.livrecursos.com.br`
- `cnameTarget()` → `cname.livrecursos.com.br` (alvo CNAME para custom domains)

**Implementacao detalhada em:** `docs/architecture/DOMINIOS-GUIDE.md`

**Regras:**
- Proxy roda no Edge Runtime — NAO pode usar Prisma direto
- Usar Upstash Redis como cache (funciona no Edge) + Supabase client como fallback
- TTL do cache: 5 minutos
- Subdominios reservados em livrecursos.com.br: www, app, api, admin, painel, mail, smtp, ftp, cdn, assets, static, staging, dev, test
- TODA query no contexto da vitrine DEVE filtrar por tenant_id
- NUNCA permitir acesso cross-tenant
- Cookies de sessao sao automaticamente isolados pelos dominios (PMB e livrecursos nao compartilham sessao)

## Integracoes API — Resumo Rapido

### plataforma parceira (form-data, NAO JSON!)
- Base: `https://SUAESCOLA.com/api/v2/`
- Auth: Token via form-data
- **Doc completa:** `docs/api/plataforma-parceira-api-completa.md`
- CUIDADOS: `vinculocurso` sem idcurso = vincula TODOS. DELETE usa HEADERS. Precos em formato BR.

### Asaas (JSON, REST padrao)
- Base: `https://api.asaas.com/v3/`
- Auth: Header `access_token`
- Webhook: token no header `asaas-access-token`, responder 200 em <22s

### Mercado Pago (JSON, REST)
- Base: `https://api.mercadopago.com/`
- Auth: Bearer Token (do REVENDEDOR, nao nosso!)
- Webhook: HMAC SHA256, envia so ID — precisa GET para detalhes
- `mp_access_token` DEVE ser criptografado com AES-256-GCM no banco

## Fluxos Criticos (decorar)

### Matricula Automatica
```
MP webhook → GET /v1/payments/{id} → status=approved
→ POST plataforma usuarios/novo {polo, vendedor, status:"ativo", apostila:"liberar"}
→ POST plataforma usuarios/vinculocurso {aluno, idcurso}
→ POST plataforma usuarios/envioemail {aluno}
→ Salvar enrollment no banco
```

### Bloqueio por Inadimplencia
```
MP webhook falhou → checar tenant.billing_mode
→ AUTO: POST plataforma usuarios/editar {status:"bloqueado", apostila:"bloquear"}
→ MANUAL: notificar revendedor
```

### Onboarding Revendedor
```
POST Asaas customers → POST Asaas subscriptions
→ Webhook PAYMENT_RECEIVED
→ POST plataforma funcionarios/novo → vendedor_id
→ Criar tenant no banco → Revendedor configura vitrine + conecta MP
```

## Padroes de Codigo

- TypeScript strict
- Componentes: PascalCase, um por arquivo
- API Routes: validar TODOS inputs com Zod
- Prisma: SEMPRE filtrar por tenant_id no contexto de vitrine
- Erros: try/catch com tipos customizados, nunca swallow errors
- Tokens: NUNCA expor no client. MP access_token criptografado.
- Webhooks: logar TUDO em webhook_logs, processar async, retornar 200 imediato

## MCP — Supabase (Project-Scoped)

Este projeto usa o Supabase MCP configurado em `.mcp.json` (project-local, nao commitado por seguranca).

- **Project Ref:** jpwskehhnplmmtgyyxmf
- **URL do projeto:** https://jpwskehhnplmmtgyyxmf.supabase.co
- **Access Token:** salvo em `SUPABASE_ACCESS_TOKEN` (.env.local)

### Como usar
Apos configurar o `.mcp.json` na raiz, reinicie o Claude Code. As ferramentas do Supabase ficarao disponiveis automaticamente para queries diretas no banco, gerenciamento de tabelas, RLS policies, etc.

### Onboarding em outra maquina
1. Copiar `.mcp.json.example` para `.mcp.json`
2. Substituir `${SUPABASE_ACCESS_TOKEN}` pelo token real (do .env.local)
3. Reiniciar Claude Code

### Importante
- Nunca commitar `.mcp.json` (contem token de admin do Supabase com poder total no projeto)
- O token expira? Nao — e um Personal Access Token, valido ate revogacao manual em supabase.com/dashboard/account/tokens
- Se vazar: revogar imediatamente em supabase.com/dashboard/account/tokens e gerar novo

## Variaveis de Ambiente

```env
# App
NEXT_PUBLIC_APP_URL=https://profissionalizamaisbrasil.com.br
NEXT_PUBLIC_APP_DOMAIN=profissionalizamaisbrasil.com.br
NEXT_PUBLIC_VITRINE_DOMAIN=livrecursos.com.br

# Database (Supabase)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
SUPABASE_PROJECT_REF=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ACCESS_TOKEN=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://profissionalizamaisbrasil.com.br

# plataforma parceira
EA_API_URL=https://SUAESCOLA.com/api/v2
EA_API_TOKEN=

# Asaas
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=

# Mercado Pago (tokens dos revendedores sao por tenant, no banco)
# Nao tem token global aqui

# Vercel (dominios custom)
VERCEL_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=

# Criptografia
ENCRYPTION_KEY=

# Email
RESEND_API_KEY=

# Cron
CRON_SECRET=
```

## Comandos Uteis

```bash
npm run dev                     # Dev server
npx prisma migrate dev          # Criar migration
npx prisma generate             # Gerar client
npx prisma studio               # UI do banco
npx prisma db seed              # Seed dados
```
