# Autoria de curso pela unidade — contrato PMB ↔ LMS

> Complementa `docs/api/lms-webhook-catalogo.md`. Aqui está **o que o LMS
> precisa expor** para que uma unidade (revenda) produza o próprio curso.
>
> **Estado:** LIGADO e VALIDADO em produção (24/08/2026). `LMS_AUTHORING_ENABLED`
> está `true` na Vercel. O que falta é habilitação COMERCIAL, unidade a unidade
> (ver §5).
> **Data:** 2026-08-21 (PMB) · 2026-08-23 (LMS) · 2026-08-24 (produção).

---

## 1. Por que existe

O PMB passou a ser um **marketplace de duas pontas**: a unidade produz curso
próprio, escolhe em quais vitrines ele é vendido e define a comissão de quem
vender. O financeiro (cobrança, rateio, comissão, certificado) continua **100%
no PMB** — o LMS entrega **conteúdo**, como já faz.

Antes desta entrega, o `/api/v1` do LMS era leitura de catálogo + comandos de
matrícula; a área de autoria vivia em `/api/autoria`, interna, e **não existia
curso com dono**. Eram essas duas lacunas — hoje fechadas nos dois repositórios.

## 2. O princípio que não pode ser quebrado

> **Curso com dono NÃO entra no catálogo global.**

`GET /api/v1/courses` alimenta a vitrine de toda a rede. Se um curso de uma
unidade aparecer ali como curso comum, o PMB o gravaria com `author_tenant_id`
nulo — ou seja, como **curso do catálogo da PMB** — e ele seria distribuído de
graça para todas as vitrines, vendido sem repasse nenhum ao dono.

O alcance de um curso de autoria é decidido no PMB (`Course.distribution`),
nunca no LMS.

## 3. Endpoints a implementar

### 3.1 `POST /api/v1/courses` — criar a casca

Quem cria o curso é o **PMB**, não o LMS: assim a linha em `courses` já nasce
com `author_tenant_id` e `lms_course_id` amarrados. Se a criação partisse do
LMS, o curso chegaria pelo sync e teria que ser adotado por heurística.

```jsonc
// Request
{
  "ownerTenantExternalId": "clx123...",   // Tenant.id do PMB (o mesmo de PUT /tenants/:id)
  "title": "Excel Avançado para Escritório",
  "description": "…",                      // opcional
  "workload": "40 horas"                   // opcional
}

// 201
{ "data": { "id": "uuid", "slug": "excel-avancado-para-escritorio" } }
```

- O curso nasce **rascunho e com dono**. Não aparece em `GET /courses`.
- `400` se `ownerTenantExternalId` não for uma unidade conhecida do LMS
  (registre-a antes com `PUT /api/v1/tenants/:id`, que o PMB já chama).

### 3.2 `PATCH /api/v1/courses/:id` — publicar / despublicar

```jsonc
{ "published": true }
```

Espelha o estado do PMB. Curso **com dono** publicado entra em `GET /courses`
apenas com `ownerTenantExternalId` preenchido (ver §3.4) — quem decide onde ele
é vendido continua sendo o PMB.

### 3.3 `POST /api/v1/sso/author-token` — editar o conteúdo

Link de uso único para a pessoa da unidade entrar na **área de autoria** do LMS.

```jsonc
// Request
{
  "tenantExternalId": "clx123...",
  "courseId": "uuid",
  "returnUrl": "https://profissionalizamaisbrasil.com.br/painel/cursos"
}

// 200
{ "url": "https://lms.bmbr.com.br/autoria/…?t=…" }
```

**Escopo é responsabilidade do LMS:** o token não pode abrir a autoria de curso
de outra unidade nem do catálogo da PMB. O PMB já garante a outra metade —
só emite o token para quem é autor do curso (filtro por `authorTenantId` na
própria query).

Como o LMS cumpre isso (`src/lib/authoring-scope.ts` de lá): o token cria uma
sessão `role: "author"` presa a UM curso, e **toda** action de edição e **toda**
rota de upload comparam duas coisas antes de escrever —
`course.ownerTenantExternalId === session.tenantExternalId` **e**
`course.id === session.courseId`. A primeira isola o catálogo da plataforma por
construção: lá o dono é `null`, e `null` nunca é igual ao id de uma unidade.

O curso dono é resolvido subindo pela **relação da entidade alterada**
(aula → módulo → curso), nunca pelo `courseId` que veio no formulário — senão
bastaria mandar o próprio `courseId` junto com o `id` da aula de outro.

A área `/autoria` continua sendo do dono da plataforma: cada página
administrativa cobra `requireAdmin()`, e a sessão de autor só alcança o editor,
a pré-visualização e a prova **daquele** curso. Apagar curso e criar categoria
seguem exclusivos do admin.

### 3.4 `GET /api/v1/courses` — campo novo

Acréscimo **aditivo** ao payload de cada curso:

| Campo | Tipo | Significado |
|---|---|---|
| `ownerTenantExternalId` | `string \| null` | Unidade dona. `null`/ausente = catálogo da PMB (todo o catálogo de hoje) |

O PMB já tolera a ausência do campo. Quando ele chegar preenchido para um curso
que o PMB ainda não conhece, a linha nasce **rascunho e oculta** — nunca no
catálogo da PMB. Se o `ownerTenantExternalId` não casar com nenhuma unidade, o
PMB registra um aviso e mantém o curso fora de todas as vitrines.

O mesmo campo deve viajar em `GET /api/v1/courses/:slug` e no delta
`GET /api/v1/day-update`.

## 4. O que NÃO muda

- Matrícula, SSO do aluno, progresso, bloqueio e branding continuam idênticos.
- Preço, comissão, rateio e certificado **não existem no LMS**. O
  `suggestedPriceCents` de um curso com dono é ignorado pelo PMB: o valor vale é
  o `authorAmount` que a unidade definiu no painel dela.
- O webhook `course.published` / `course.updated` / `course.unpublished`
  continua igual — o PMB re-puxa o catálogo.

## 5. Estado em produção

**Já feito** (24/08/2026): LMS no ar com §3.1–§3.4, `LMS_AUTHORING_ENABLED=true`
na Vercel, e o módulo **Produzir cursos** ligado na unidade `vocequervocepode`.

**Para liberar outra unidade:** /admin/revendedores/[id] → aba "Vitrine &
extras" → *Produzir cursos*. É habilitação comercial, uma a uma; sem ela a aba
"Meus cursos" nem aparece no painel da unidade.

### O que foi validado contra produção

| # | Verificação | Resultado |
|---|---|---|
| 1 | `POST /courses` com dono desconhecido | 400 |
| 2 | Casca criada com dono, em rascunho | ok |
| 3 | Curso com dono NÃO entra em `GET /courses` enquanto rascunho | ok |
| 4 | `author-token` para curso de OUTRA unidade | 403 |
| 5 | `author-token` para curso do catálogo da PMB | 403 |
| 6 | `PATCH published` em curso do catálogo da PMB | 403 |
| 7 | SSO de uso único; replay | `/login?erro=autoria` |
| 8 | Sessão de autor abre o PRÓPRIO curso | 200 |
| 9 | Upload de capa no próprio curso | grava no MinIO |
| 10 | Upload em curso de outro dono | 403 |
| 11 | `presign`/`complete` em aula de outro dono | 403 |
| 12 | Upload sem sessão | 401 |

### O que ainda depende de um navegador

O caminho pelo PAINEL (a unidade logada clicando em Catálogo → Meus cursos →
Novo curso → Conteúdo) não foi percorrido com sessão real — a cadeia
servidor-a-servidor acima cobre tudo o que ele aciona, mas o clique em si e a
tela ficam para uma conferência sua.

### O que NÃO ligar junto

Só depois de o fluxo acima fechar é que faz sentido publicar para a rede
(`distribution: NETWORK`): aí entra o rateio, que pede a carteira Asaas da
unidade e merece um teste em sandbox antes (cobrança avulsa com 2 linhas e um
carnê 3x conferindo o split por parcela).

Enquanto a flag estiver desligada, a unidade monta o curso e os termos
comerciais normalmente, mas ele fica em **rascunho**: publicar sem conteúdo
faria a venda ser cobrada e o provisionamento falhar com o aluno já tendo pago.
