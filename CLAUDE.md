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

Segunda fornecedora de cursos: LMS proprio em `https://lms.bmbr.com.br` (API M2M REST JSON `/api/v1`, Bearer `LMS_API_KEY`). **Aditiva** — EA legada intacta. O LMS provisiona nos parceiros por baixo (PMB → LMS → EA); financeiro 100% no PMB.

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
