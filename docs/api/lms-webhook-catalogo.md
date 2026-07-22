# Integração LMS ↔ PMB — Documento completo

> Referência de integração máquina-a-máquina (M2M) entre a **Área do Aluno (LMS,
> `lms.bmbr.com.br`)** e a vitrine **Profissionaliza + Brasil (PMB)**. Cobre tudo o que o
> PMB **puxa**, tudo o que o PMB **chama** e tudo o que o LMS **dispara** de volta —
> incluindo a **matriz curricular (`curriculum`)** e o evento **`course.updated`**.
>
> Fonte canônica dos contratos: `docs/API.md` (repositório do LMS). Este documento organiza
> a mesma informação **por direção de comunicação** e acrescenta o mapeamento LMS→PMB e o
> checklist de conferência.
>
> **Atualizado:** 2026-07-02. **Estado no PMB:** importação de `curriculum` (matriz) e evento
> `course.updated` **ativos em produção**.

---

## 1. Princípios

- **Financeiro fica 100% no PMB.** O LMS não toca em pagamento, cobrança, comissão nem
  certificado — só entrega conteúdo, reporta evolução e provisiona acesso nos parceiros
  (ex.: Escola Avançada).
- **Base URL (produção):** `https://lms.bmbr.com.br`
- **Namespace M2M:** `/api/v1` (as rotas `/api/aluno`, `/api/autoria` e `/sso` são internas).

---

## 2. Modelo de integração

Três canais, todos documentados abaixo:

| Direção | Quem inicia | Para quê |
|---|---|---|
| **PULL** | PMB lê do LMS | Catálogo (`/courses`, `/day-update`) e estado do aluno (`/students/:id`). A **matriz curricular vem junto** no catálogo. |
| **PUSH** | PMB chama o LMS | Vendas e comandos: `/enrollments`, `/access`, `/tenants/:id`, `/sso/token`. |
| **WEBHOOK** | LMS dispara ao PMB | Evento leve assinado ao publicar/editar/despublicar curso → o PMB **re-puxa** o catálogo. Opcional; reduz latência. |

> **Regra de ouro:** o webhook **não** carrega o curso inteiro — só avisa. Os dados
> (inclusive a `curriculum`) sempre chegam pelo **pull**. O mesmo motor de sync roda em
> três caminhos: **cron diário**, **botão do admin** e **webhook**. Enquanto o webhook
> estiver desligado, tudo continua entrando pelo pull diário.

---

## 3. Autenticação e convenções

Toda chamada a `/api/v1/**` exige:

```
Authorization: Bearer <LMS_API_KEY>
```

`LMS_API_KEY` é variável de ambiente do LMS (comparada em tempo constante). Sem ela ou com
valor inválido → `401`.

- Corpo e respostas em **JSON**; datas sempre em **ISO-8601 (UTC)**.
- Sucesso: `{ "data": … }`. Listas trazem extras como `count`. Erro: `{ "error": "mensagem" }`
  com o status HTTP correspondente.
- IDs são **UUIDs reais** do LMS. O aluno é referenciado por **`studentExternalId`** (id do
  aluno no PMB); rotas `:id` de aluno aceitam o id interno **ou** o `externalId`.

### Índice de endpoints

| Direção | Método | Rota | Descrição |
|---|---|---|---|
| PULL | GET | [`/api/v1/courses`](#51-get-apiv1courses) | Catálogo de cursos publicados |
| PULL | GET | [`/api/v1/courses/:slug`](#52-get-apiv1coursesslug) | Detalhe do curso (página de vendas) |
| PULL | GET | [`/api/v1/day-update`](#53-get-apiv1day-update) | Sincronização diária incremental (delta) |
| PULL | GET | [`/api/v1/students/:id`](#71-get-apiv1studentsid) | Consulta completa do aluno |
| PULL | GET | [`/api/v1/students/:id/progress`](#72-get-apiv1studentsidprogress) | Progresso por curso (enxuto) |
| PUSH | POST | [`/api/v1/enrollments`](#81-post-apiv1enrollments) | Matrícula (venda + provisionamento) |
| PUSH | POST | [`/api/v1/enrollments/:id/revoke`](#82-post-apiv1enrollmentsidrevoke) | Revoga acesso a um curso |
| PUSH | PATCH | [`/api/v1/students/:id/access`](#83-patch-apiv1studentsidaccess) | Bloqueia/reativa o aluno |
| PUSH | PUT | [`/api/v1/tenants/:id`](#84-put-apiv1tenantsid) | Branding da revenda + base do certificado |
| PUSH | POST | [`/api/v1/sso/token`](#85-post-apiv1ssotoken) | Emite link SSO de uso único |
| WEBHOOK | POST | [`…/api/webhooks/lms`](#9-webhooks-lms--pmb) | Eventos LMS→PMB (o PMB recebe) |
| OPERAÇÃO | POST | [`/api/v1/import/:source/run`](#10-operação-cron) | Importa catálogo de um parceiro |
| OPERAÇÃO | POST | [`/api/v1/webhooks/dispatch`](#10-operação-cron) | Dispara webhooks pendentes (cron) |

---

## 4. Novidades desta versão

Dois acréscimos **aditivos** (nenhum campo removido ou renomeado):

### 4.1. Matriz curricular (`curriculum`) no catálogo

Todo curso passa a trazer a **grade** — lista de componentes com carga horária e ementa —
em `curriculum[]`, mais o total em `totalWorkloadHours`. Presente em `GET /courses`,
`GET /courses/:slug` e `GET /day-update`.

É **obrigatória na publicação**, então nos endpoints de catálogo **nunca vem vazia** (mesma
garantia de `categories` e `suggestedPriceCents`).

### 4.2. Evento `course.updated`

Quando um curso **já publicado** é editado (preço, categoria, **matriz**, conteúdo, aulas),
o LMS dispara `course.updated` → o PMB re-sincroniza em tempo real. Editar um **rascunho não
notifica** (o PMB só conhece cursos publicados).

---

## 5. PMB puxa — Catálogo

### 5.1. `GET /api/v1/courses`

Catálogo de cursos **publicados e visíveis** — a vitrine consome para montar a loja.

**Resposta `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "eletricista-residencial",
      "title": "Eletricista Residencial",
      "description": "…",
      "workload": "12 horas",
      "suggestedPriceCents": 19700,
      "categories": [
        { "id": "uuid", "slug": "eletrica", "name": "Elétrica" }
      ],
      "curriculum": [
        { "id": "uuid", "title": "Módulo 1 — Fundamentos", "workloadHours": 4, "ementa": "…", "order": 0 },
        { "id": "uuid", "title": "Módulo 2 — Instalações",  "workloadHours": 8, "ementa": "…", "order": 1 }
      ],
      "totalWorkloadHours": 12,
      "version": 1,
      "publishedAt": "2026-06-16T12:46:30.065Z",
      "moduleCount": 2,
      "lessonCount": 6,
      "durationSec": 3519,
      "materialCount": 2
    }
  ],
  "count": 1
}
```

- `suggestedPriceCents` — valor sugerido para a vitrine, em **centavos** (`19700` = R$ 197,00).
  **Obrigatório na publicação** → nunca `null` no catálogo.
- `categories` — taxonomia N–N da vitrine (`{ id, slug, name }`, ordenada por `name`).
  **≥ 1 obrigatória** na publicação → nunca vazia.
- **`curriculum`** _(NOVO)_ — matriz curricular (grade), ordenada por `order`.
  **Obrigatória** → nunca vazia no catálogo.
- **`totalWorkloadHours`** _(NOVO)_ — soma das horas dos itens de `curriculum`.

> **No PMB:** `curriculum` é mapeada para `Course.matrizCurricular` (lista de tópicos =
> `title`, ordenada por `order`). Ver §11.

### 5.2. `GET /api/v1/courses/:slug`

Detalhe para a **página de vendas** (árvore módulos→aulas). **Não** expõe a URL do vídeo (só
após matrícula/SSO). Curso não publicado → `404`.

**Resposta `200`:**

```json
{
  "data": {
    "id": "uuid",
    "slug": "eletricista-residencial",
    "title": "Eletricista Residencial",
    "description": "…",
    "workload": "12 horas",
    "suggestedPriceCents": 19700,
    "categories": [ { "id": "uuid", "slug": "eletrica", "name": "Elétrica" } ],
    "curriculum": [
      { "id": "uuid", "title": "Módulo 1 — Fundamentos", "workloadHours": 4, "ementa": "…", "order": 0 }
    ],
    "totalWorkloadHours": 12,
    "coverColor": "#025918",
    "coverImage": "",
    "version": 1,
    "minPercent": 80,
    "publishedAt": "2026-06-16T12:46:30.065Z",
    "moduleCount": 2,
    "lessonCount": 6,
    "durationSec": 3519,
    "materialCount": 2,
    "freePreviewLessonId": "uuid",
    "modules": [
      {
        "id": "uuid",
        "title": "Módulo 1 — Fundamentos",
        "order": 0,
        "lessons": [
          { "id": "uuid", "title": "Boas-vindas ao curso", "order": 0, "durationSec": 192, "freePreview": true, "materialCount": 0 }
        ]
      }
    ]
  }
}
```

`curriculum`/`totalWorkloadHours` seguem a mesma semântica de `GET /courses`. Aqui a
`curriculum` completa (com `ementa`) alimenta a **matriz curricular** exibida na página de
vendas. **Erros:** `404` `{ "error": "Curso não encontrado." }`.

### 5.3. `GET /api/v1/day-update`

Busca diária do PMB (cron ou "sincronizar agora"). Retorna **só o que mudou** desde `since`
— cursos e alunos.

**Query:** `?since=<ISO-8601>`. Sem `since` → **export completo** (1ª carga). `since`
malformado → `400` (não cai silenciosamente em export completo).

**Resposta `200`:**

```json
{
  "data": {
    "courses": [
      {
        "id": "uuid", "slug": "…", "title": "…", "description": "…",
        "workload": "12 horas", "suggestedPriceCents": 19700, "version": 2,
        "categories": [{ "id": "uuid", "slug": "eletrica", "name": "Elétrica" }],
        "curriculum": [{ "id": "uuid", "title": "Módulo 1 — Fundamentos", "workloadHours": 4, "ementa": "…", "order": 0 }],
        "totalWorkloadHours": 12,
        "status": "published", "visible": true,
        "publishedAt": "…", "updatedAt": "…",
        "moduleCount": 2, "lessonCount": 6, "durationSec": 3519, "materialCount": 2
      }
    ],
    "students": [
      {
        "studentExternalId": "pmb-stu-1002",
        "tenantExternalId": "pmb",
        "name": "Maria da Silva",
        "status": "active",
        "courses": [
          {
            "courseId": "uuid", "slug": "…", "title": "…",
            "percent": 80, "status": "in_progress", "completedAt": null,
            "lastActivityAt": "…", "enrollmentStatus": "active",
            "grantedAt": "…", "revokedAt": null
          }
        ]
      }
    ]
  },
  "since": "2026-07-01T09:00:00.000Z",
  "generatedAt": "2026-07-02T09:00:00.000Z",
  "counts": { "courses": 1, "students": 1 }
}
```

**Como usar:**

- Guarde `generatedAt` e mande como `since` na próxima execução (cursor).
- Em `courses`, use `status`/`visible` para **adicionar ou remover** o curso da vitrine.
- **Edições da matriz** (`curriculum`) bumpam `updatedAt` → chegam no delta sem nada novo.
- Em `students`, só vêm **alunos ativos** e, para cada um, **só os cursos que mudaram**.
- A conclusão de curso chega aqui (`status: "completed"` + `completedAt`).

> **Nota de implementação (PMB):** o consumidor do `day-update` no PMB reflete
> **(des)publicação** (`status`/`visible`) e **progresso do aluno**; o conteúdo do catálogo
> (preço, categoria, **matriz**, capa, aulas) é persistido pelo **sync completo**
> (`GET /courses` + detalhe), que roda no cron diário, no botão do admin e no webhook
> `course.updated`. Ou seja: uma edição de matriz aparece pelo webhook (tempo real) ou pelo
> sync diário — não pelo delta de progresso.

---

## 6. Objeto Curso — referência de campos

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | UUID real do curso no LMS. |
| `slug` | string | Identificador estável para URL. |
| `title` | string | Nome do curso. |
| `description` | string | Descrição. |
| `workload` | string | Carga horária livre (ex.: "12 horas"). |
| `suggestedPriceCents` | int \| null | Preço sugerido em **centavos**. Obrigatório na publicação. |
| `categories[]` | obj[] | `{ id, slug, name }`, ordenado por `name`. ≥ 1 obrigatória. |
| **`curriculum[]`** | obj[] | **(NOVO)** Matriz curricular, ordenada por `order`. Obrigatória → nunca vazia no catálogo. |
| **`totalWorkloadHours`** | int | **(NOVO)** Soma das horas dos itens da matriz. |
| `version` | int | Incrementa a cada nova publicação. |
| `status` | string | `published` \| `draft` (presente em `day-update`). |
| `visible` | bool | Entra no catálogo geral (presente em `day-update`). |
| `moduleCount` / `lessonCount` | int | Contagens de módulos e aulas. |
| `durationSec` / `materialCount` | int | Duração total (s) e nº de materiais. |
| `publishedAt` / `updatedAt` | ISO-8601 | Publicação e última alteração. |
| `coverColor` / `coverImage` | string | Só no detalhe (`/courses/:slug`). |
| `minPercent` | int | Critério de conclusão (%). Só no detalhe. |
| `freePreviewLessonId` | string \| null | Aula de amostra grátis. Só no detalhe. |
| `modules[]` | obj[] | Árvore módulos→aulas. Só no detalhe. |

### Item da matriz curricular (`curriculum[]`)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | Id do componente. |
| `title` | string | Nome do componente/disciplina. |
| `workloadHours` | int | Carga horária **em horas**. |
| `ementa` | string | Descrição do componente (pode ser `""`). |
| `order` | int | Ordem de exibição. |

> **Semântica de sync da matriz (PMB):** se `curriculum` vier **ausente** no payload, o PMB
> **não altera** a matriz atual; se vier **`[]`**, limpa de propósito. Como é obrigatória na
> publicação, o catálogo sempre a envia preenchida. No PMB, cada item vira um tópico da
> `matrizCurricular` usando o `title` (a `ementa`/`workloadHours` não entram no tópico — a
> carga total já aparece via `workload`).

---

## 7. PMB puxa — Aluno

### 7.1. `GET /api/v1/students/:id`

Consulta **completa** (perfil + cursos + evolução + credenciais). Pensada para o PMB disparar
ao abrir a página de perfil. `:id` aceita id interno ou `externalId`.

**Resposta `200`:**

```json
{
  "data": {
    "studentId": "uuid",
    "externalId": "pmb-stu-1002",
    "tenantExternalId": "vitrine.pmb",
    "name": "Maria da Silva",
    "email": "maria@exemplo.com",
    "status": "active",
    "courses": [
      {
        "courseId": "uuid", "slug": "eletricista-residencial", "title": "Eletricista Residencial",
        "origin": "own", "enrollmentStatus": "active", "grantedAt": "…", "revokedAt": null,
        "percent": 50, "status": "in_progress", "completedAt": null, "lastActivityAt": "…"
      }
    ],
    "platformAccess": {
      "own": { "login": "maria@exemplo.com", "password": "Xy7k…", "portalUrl": "https://lms.bmbr.com.br/login" },
      "escola-avancada": { "login": "maria.silva", "password": "ea-senha", "portalUrl": "https://playcurso.com/escola" }
    }
  }
}
```

- `platformAccess` — mapa **por origem** (`"own"` ou a chave do parceiro) com a credencial
  `{ login, password, portalUrl }` para o PMB **exibir**. `password` em claro (pode ser `null`
  para aluno legado ou senha definida pelo aluno).
- ⚠️ **Segurança:** a senha trafega em claro **apenas** nas respostas M2M com credencial
  (Bearer `LMS_API_KEY` + TLS). É guardada **cifrada** (AES-256-GCM) no LMS, nunca aparece em
  logs nem nos feeds em massa (`day-update`/`progress`). Cada leitura gera auditoria
  `student.credentials.read`.

**Erros:** `404` (aluno não encontrado).

### 7.2. `GET /api/v1/students/:id/progress`

Versão **enxuta**, só progresso por curso. `:id` aceita id interno ou `externalId`.

```json
{
  "data": {
    "studentId": "uuid",
    "externalId": "pmb-stu-1002",
    "status": "active",
    "courses": [
      { "courseId": "uuid", "slug": "…", "title": "…", "percent": 45, "status": "in_progress", "completedAt": null }
    ]
  }
}
```

**Erros:** `404` (aluno não encontrado).

---

## 8. PMB chama — Comandos

### 8.1. `POST /api/v1/enrollments`

Recebe a venda, cria o espelho do aluno + matrícula e **provisiona o acesso no parceiro**
(ex.: Escola Avançada via `usuarios/novo` + `usuarios/vinculocurso`). **Idempotente**.

**Cabeçalho opcional:** `Idempotency-Key: <id-da-venda>`

**Body:**

```json
{
  "studentExternalId": "pmb-stu-1002",
  "student": { "name": "Maria da Silva", "email": "maria@exemplo.com" },
  "courseId": "uuid-do-curso",
  "tenantExternalId": "ze",
  "partner": {
    "polo": "Contagem",
    "vendedor": "Maria",
    "portalUrl": "https://playcurso.com/SUAESCOLA"
  }
}
```

- `student.email` é validado.
- `tenantExternalId` é opcional (default `"pmb"`), mas para o aluno ver a **logo da revenda**
  que vendeu, o PMB **deve** enviar aqui o `tenantExternalId` da revenda (o mesmo registrado
  em `PUT /api/v1/tenants/:id`). Sem ele — ou com `"pmb"` — o aluno vê a marca do sistema-mãe.
- **`partner` (opcional)** — dados de provisionamento por venda, repassados ao conector:

  | Campo | Tipo | Descrição |
  |---|---|---|
  | `partner.polo` | string | Unidade que fechou a matrícula (EA `usuarios/novo`). |
  | `partner.vendedor` | string | Vendedor responsável (EA `usuarios/novo`). |
  | `partner.portalUrl` | string (URL) | Portal do aluno no parceiro (handoff/credencial). |

  `polo`/`vendedor` **variam por venda**; o valor em `partner.*` tem **precedência** sobre o
  fallback configurado na integração. Para operação **multi-polo**, o PMB deve enviar
  `partner.polo` (e `partner.vendedor`) em cada matrícula. Ignorados para cursos próprios.

**Resposta `201`:**

```json
{
  "data": {
    "enrollmentId": "uuid",
    "studentId": "uuid",
    "courseId": "uuid",
    "origin": "own",
    "playback": "local",
    "provisioning": { "target": "local", "ok": true, "message": "Acesso liberado no próprio sistema." },
    "platformAccess": { "login": "maria@exemplo.com", "password": "Xy7k…", "portalUrl": "https://lms.bmbr.com.br/login" }
  }
}
```

- `origin`: `"own"` (curso próprio) ou a chave do parceiro (ex.: `"escola-avancada"`).
- `playback`: `"local"` (player do LMS) ou `"redirect"` (assiste no parceiro).
- `platformAccess`: credencial da origem deste curso, com a **senha em claro** (pode ser
  `null`). Em curso próprio o LMS gera credencial real na 1ª vez; em parceiro vem a senha dele.
- **Mesmo com falha no parceiro a resposta é `201`** com `provisioning.ok=false` — o espelho
  local foi criado e a chamada pode ser repetida com segurança.

**Erros:** `400` (campos obrigatórios / e-mail inválido), `404` (curso não encontrado).

### 8.2. `POST /api/v1/enrollments/:id/revoke`

Revoga o acesso a **um** curso (local). **Idempotente**.

```json
{ "data": { "enrollmentId": "uuid", "status": "revoked" } }
```

**Erros:** `404` (matrícula não encontrada).

### 8.3. `PATCH /api/v1/students/:id/access`

Bloqueia ou reativa o aluno **e propaga** aos parceiros. `:id` = id interno ou `externalId`.

**Body:** `{ "status": "blocked" }` — `status ∈ "active" | "blocked"`.

```json
{
  "data": {
    "studentId": "uuid",
    "status": "blocked",
    "propagated": [ { "partner": "Escola Avançada / PlayCurso", "ok": true, "message": "Acesso blocked na EA." } ]
  }
}
```

**Erros:** `400` (status inválido), `404` (aluno não encontrado).

### 8.4. `PUT /api/v1/tenants/:id`

Upsert da configuração de uma revenda (white-label). `:id` = `tenantExternalId` (o mesmo
enviado nas matrículas). Define branding e base do certificado.

**Body** (campos opcionais):

```json
{
  "brandName": "Escola do Zé",
  "logoUrl": "https://cdn.pmb.com.br/revendas/ze/logo.png",
  "certificateBaseUrl": "https://ze.pmb.com.br/certificado"
}
```

- `brandName` — nome exibido no topo/rodapé/certificado (máx. 120 caracteres).
- `logoUrl` — URL da logo (PNG/SVG). Vazio → o aluno vê as iniciais do `brandName`.
- `certificateBaseUrl` — destino de "Ver certificado" (o PMB emite). Vazio → versão local.

A marca é resolvida **por aluno** a partir de `Student.tenantExternalId`. **Erros:** `400`
(URLs inválidas).

### 8.5. `POST /api/v1/sso/token`

Emite um **link SSO de uso único** (TTL ~5 min) para o aluno entrar no player. Matricule o
aluno antes.

```json
// Request
{ "studentExternalId": "pmb-stu-1002", "tenantExternalId": "vitrine.pmb", "returnUrl": "https://pmb.exemplo.com/aluno" }

// Resposta 200
{ "url": "https://lms.bmbr.com.br/sso?token=<token>" }
```

`tenantExternalId` e `returnUrl` são opcionais. **Erros:** `400` (`studentExternalId`
obrigatório), `404` (aluno não encontrado — matricule antes).

### 8.6. `PATCH /api/v1/enrollments/:id/limit` — cota de aulas ✅ *implementado*

> **Status:** implementado dos DOIS lados (LMS commit `83ec0b1`). O PMB envia o teto por
> `setLmsEnrollmentLimit`; matrícula sem LMS segue no paliativo `PATCH /students/:id/access`
> (§8.3), que é tudo-ou-nada por aluno. **Pendente de deploy:** as 3 colunas novas em
> `Enrollment` precisam da migration no Postgres do LMS antes de subir o código.

**Para quê.** Na venda parcelada (carnê/mensalidade) o aluno só pode avançar até a
fração do curso que já pagou: `cota = floor(parcelas pagas / total × 100)`. Um plano
2× libera 50% já na 1ª parcela; 6× libera 16%. Sem isso, quem paga a 1ª de 6 maratona
o curso e some — e a única defesa do PMB é recusar o certificado.

**Body:**

```json
{ "maxPercent": 50, "reason": "installment", "unlockUrl": "https://…/aluno/pagamentos" }
```

| Campo | Tipo | Descrição |
|---|---|---|
| `maxPercent` | int \| null | Teto de progresso liberado (0–100). **`null` remove o limite** (curso quitado). |
| `reason` | string | Motivo, para a mensagem ao aluno. Hoje só `"installment"`. |
| `unlockUrl` | string (URL) | Para onde mandar o aluno destravar (checkout do PMB). |

**Resposta `200`:** `{ "data": { "enrollmentId": "uuid", "maxPercent": 50 } }`

**Comportamento esperado:**

- **Idempotente** — reenviar o mesmo `maxPercent` é no-op.
- O LMS **impede iniciar a aula** que ultrapassaria `maxPercent` e exibe a mensagem com
  o `unlockUrl`. Aula já iniciada pode terminar; o bloqueio vale para avançar.
- O aluno **mantém acesso ao que já liberou** — a trava é um teto, não uma revogação.
- ⛔ **Nunca desvincular a matrícula no parceiro.** Em curso de parceiro
  (`origin != "own"`, provisionado na Escola Avançada por baixo), o LMS deve aplicar a
  trava por **flag de acesso** — a mesma semântica de `PATCH /students/:id/access`.
  Desvincular e revincular na EA **ZERA o progresso do aluno** (verificado em
  jul/2026; ver `docs/api/plataforma-parceira-api-completa.md` §4.5). Uma trava que
  destrói progresso é pior que não ter trava.

**Erros:** `400` (`maxPercent` fora de 0–100), `404` (matrícula não encontrada).

**Lado do PMB:** `setLmsEnrollmentLimit()` em `src/lib/lms/client.ts`; o cálculo da cota
vive em `src/lib/enrollment/pace-gate.ts` e o motor em `src/lib/enrollment/pace.ts`.

---

## 9. Webhooks LMS → PMB

Gatilho leve assinado. O corpo **não** carrega o curso — o PMB re-puxa o catálogo ao receber.
Liga quando `PMB_WEBHOOK_URL`/`PMB_WEBHOOK_SECRET` estão definidas no LMS; enquanto desligado,
o pull diário cobre tudo.

**Endpoint (receptor no PMB):**

```
POST https://www.profissionalizamaisbrasil.com.br/api/webhooks/lms
```

> ⚠️ Use o host **`www.`** em `PMB_WEBHOOK_URL`. O apex responde **307 → www** e muitos
> clientes HTTP **não reenviam o corpo do POST** no redirect (a entrega chegaria vazia e
> falharia a assinatura).

### 9.1. Assinatura (HMAC-SHA256)

```
assinatura = HMAC_SHA256( "<X-PMB-Timestamp>.<rawBody>", PMB_WEBHOOK_SECRET )
X-PMB-Signature: sha256=<assinatura-hex>
```

- `rawBody` = corpo cru exato (mesmos bytes usados para assinar).
- Comparação em tempo constante + janela **anti-replay de 10 minutos** (o timestamp faz parte
  do que é assinado).

**Verificação (Node):**

```js
const esperado = crypto.createHmac("sha256", PMB_WEBHOOK_SECRET)
  .update(`${timestamp}.${rawBody}`).digest("hex");
// compare em tempo constante com o X-PMB-Signature (sem o prefixo "sha256=")
```

### 9.2. Cabeçalhos

| Header | Descrição |
|---|---|
| `X-PMB-Event-Type` | Tipo do evento (tabela abaixo). |
| `X-PMB-Event-Id` | UUID **estável entre retries** (idempotência). |
| `X-PMB-Timestamp` | Epoch em **segundos**; janela de 10 min. (O receptor tolera também ms.) |
| `X-PMB-Signature` | `sha256=<hmac-hex>`. |
| `Content-Type` | `application/json`. |

### 9.3. Eventos

| Evento | Quando |
|---|---|
| `course.published` | Curso **novo** publicado (ou voltou a ficar visível) → PMB (re)importa o catálogo. |
| **`course.updated`** | **(NOVO)** Curso **já publicado** editado (preço, categoria, matriz, conteúdo, aulas) → re-sync. |
| `course.unpublished` | Curso despublicado/oculto → sai da vitrine. |
| `lesson.completed` | Aluno concluiu uma aula (apenas na 1ª vez). |
| `course.completed` | Aluno concluiu o curso → PMB emite o certificado do tenant. |
| `student.question.created` | Aluno abriu uma dúvida no player. |

Os três eventos de catálogo (`course.published`/`updated`/`unpublished`) disparam um **sync
completo** do catálogo no PMB (não um patch de um curso só) — idempotente e barato.

### 9.4. Corpo dos eventos de catálogo (mínimo)

```json
{ "courseId": "uuid", "slug": "eletricista-residencial" }
```

O PMB re-puxa os dados (inclusive a `curriculum`) pelos endpoints de leitura.

**Corpo de `course.completed`:**

```json
{ "studentExternalId": "pmb-stu-1002", "courseId": "uuid", "slug": "eletricista-residencial", "percent": 100, "completedAt": "2026-06-19T18:30:00.000Z" }
```

**Corpo de `lesson.completed`** (`completedAt` fica `null`):

```json
{ "studentExternalId": "pmb-stu-1002", "courseId": "uuid", "lessonId": "uuid", "percent": 80, "completedAt": null, "lastActivityAt": "2026-06-19T18:00:00.000Z" }
```

### 9.5. Idempotência e retry

- Reenvie sempre com o **mesmo `X-PMB-Event-Id`** — o PMB deduplica entregas já processadas.
- Retry **apenas em 5xx e falhas de rede** (backoff exponencial + jitter, cap de 1h; vai para
  DLQ ao esgotar as tentativas). `4xx` é **permanente** → não re-tentar.
- `course.updated` só dispara para cursos **publicados** — editar rascunho não notifica.

### 9.6. Exemplo de disparo assinado (Node.js)

```js
import crypto from "node:crypto";

const SECRET = process.env.PMB_WEBHOOK_SECRET;
const URL = "https://www.profissionalizamaisbrasil.com.br/api/webhooks/lms";

async function firePmbCatalog(eventType, course) {
  const body = JSON.stringify({ courseId: course.id, slug: course.slug });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = "sha256=" +
    crypto.createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PMB-Event-Type": eventType,      // course.published | course.updated | course.unpublished
      "X-PMB-Event-Id": course.eventId,   // UUID estável entre retries
      "X-PMB-Timestamp": timestamp,
      "X-PMB-Signature": signature,
    },
    body,
  });
  return res.status; // 5xx/rede → re-tentar com o MESMO X-PMB-Event-Id; 4xx → não re-tentar
}
```

---

## 10. Operação (cron)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/import/:source/run` | Importa o catálogo de um parceiro (ex.: Escola Avançada) para dentro do LMS. Idempotente e logado. |
| POST | `/api/v1/webhooks/dispatch` | Backstop do outbox: entrega os webhooks pendentes/vencidos. Chamado por cron minuto a minuto. |

Exemplo de cron do dispatcher:

```bash
*/1 * * * * curl -s -X POST -H "Authorization: Bearer <LMS_API_KEY>" \
  https://lms.bmbr.com.br/api/v1/webhooks/dispatch >/dev/null 2>&1
```

---

## 11. Mapeamento LMS → PMB

| Campo LMS | Campo PMB | Regra |
|---|---|---|
| `suggestedPriceCents` | `precoOriginal` (÷ 100) | Preço-base. Override do admin preservado. `null`/`0` → sem preço. |
| `categories[]` | `Category` + join M2M | Match por `slug`/`name` (reusa existentes). Aditivo; categoria principal preservada. |
| **`curriculum[]`** | `matrizCurricular` (`string[]`) | Ordena por `order`, usa o `title` de cada item. Ausente → não mexe; `[]` → limpa. |
| **`totalWorkloadHours`** | (não persistido) | A carga total exibida vem de `workload`; `totalWorkloadHours` é ignorado com segurança. |
| `status` / `visible` | `status` ATIVO/INATIVO | `published` + `visible` = ATIVO (entra na vitrine). |
| `title` / `description` / `workload` / `lessonCount` | `nome` / `descrição` / `cargaHoraria` / `qtdAulas` | Re-sincronizados a cada evento. |

**Regras de negócio:**

- Curso **novo** com **preço e categoria** nasce ATIVO na vitrine mãe e é propagado às revendas.
- Curso **sem preço** fica oculto (gate de preço em runtime).
- A **matriz** é re-sincronizada a cada evento (como descrição/aulas). Ausente não apaga;
  `[]` limpa.
- O sync do LMS **nunca** toca em cursos da outra fornecedora (EA).

---

## 12. Checklist de conferência (lado PMB)

| Item | O que verificar no PMB | Estado |
|---|---|---|
| `curriculum[]` | Modelo do curso aceita o array e o item `{ id, title, workloadHours, ementa, order }` sem rejeitar campos desconhecidos. | ✅ `LmsCurriculumItem` + parse tolerante |
| `totalWorkloadHours` | Campo inteiro adicionado (ou ignorado com segurança). | ✅ opcional no tipo, não persistido |
| matriz: ausente vs `[]` | Ausente = preserva a matriz atual; `[]` = limpa. | ✅ guarda `matrizCurricular !== null` |
| `course.updated` | Receptor trata o novo `X-PMB-Event-Type` como sync completo (igual `published`/`unpublished`). | ✅ mesmo case do dispatcher |
| host `www.` | `PMB_WEBHOOK_URL` aponta para `www.` (evita 307 que dropa o corpo do POST). | ⏳ configurar no LMS |
| `PMB_WEBHOOK_SECRET` | Mesmo segredo dos dois lados (aba API em `/admin/configuracoes`). | ⏳ configurar no LMS |

---

## 13. Variáveis de ambiente relevantes (LMS)

| Variável | Descrição |
|---|---|
| `LMS_API_KEY` | Chave M2M exigida em `Authorization: Bearer` de todo `/api/v1/**`. |
| `PMB_WEBHOOK_URL` | Receptor de webhooks no PMB. Vazio = webhooks desligados. Use o host `www.`: `https://www.profissionalizamaisbrasil.com.br/api/webhooks/lms`. |
| `PMB_WEBHOOK_SECRET` | Segredo HMAC dos webhooks — **mesmo valor** no PMB (aba API em `/admin/configuracoes`). |

---

_Documento gerado a partir do estado atual do código do LMS (namespace `/api/v1` + webhooks
LMS→PMB), incluindo a matriz curricular e o evento `course.updated`. Contratos canônicos em
`docs/API.md` (repositório do LMS). Lado PMB: importação de matriz e `course.updated` ativos
em produção._
