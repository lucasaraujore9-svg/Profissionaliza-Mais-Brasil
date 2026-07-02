# Integração LMS → PMB — Atualização de catálogo em tempo real (com matriz curricular)

> Documento de handoff para o time do **LMS** (lms.bmbr.com.br).
> Descreve como o LMS dispara, em tempo real, a criação/edição/(des)publicação de
> cursos no PMB — incluindo **preço sugerido**, **categorias** e **matriz
> curricular (`curriculum`)**.

---

## 1. Modelo: gatilho leve + pull

O PMB usa um modelo **pull**:

1. O LMS dispara um **evento leve** (`POST /api/webhooks/lms`) quando um curso é
   **criado, editado, publicado ou despublicado**.
2. Ao receber o evento, o PMB **re-puxa o catálogo do LMS** (`GET /api/v1/courses`
   e afins) e reaplica preço, categorias, **matriz** e conteúdo.

Consequência prática: **o webhook NÃO precisa carregar o curso inteiro**. Os dados
(inclusive a matriz) chegam pelo pull. O corpo do evento serve só para
log/rastreio. A matriz "vem junto" porque o pull já a inclui em `curriculum`.

O mesmo motor de sincronização roda em 3 caminhos: **cron diário**, **botão do
admin** e este **webhook** — então qualquer campo novo do feed entra pelos três.

---

## 2. Endpoint de gatilho (LMS → PMB)

```
POST https://www.profissionalizamaisbrasil.com.br/api/webhooks/lms
```

> ⚠️ Use o host **`www.`**. O apex (`profissionalizamaisbrasil.com.br`) responde
> **307 → www**, e muitos clientes HTTP não reenviam o corpo do POST no redirect.

### 2.1. Autenticação (HMAC-SHA256)

Cada entrega é assinada com o segredo compartilhado **`PMB_WEBHOOK_SECRET`**:

```
assinatura = HMAC_SHA256( "<X-PMB-Timestamp>.<rawBody>", PMB_WEBHOOK_SECRET )
X-PMB-Signature: sha256=<assinatura em hex>
```

- `rawBody` = corpo **cru exato** enviado (mesmos bytes usados para assinar).
- O PMB compara em tempo constante e valida a **janela anti-replay de 10 minutos**
  (o `X-PMB-Timestamp` faz parte do manifest assinado).
- O segredo é o **mesmo valor** exibido na aba **API** em `/admin/configuracoes`
  (visível só para SUPER_ADMIN).

### 2.2. Headers

| Header | Obrigatório | Descrição |
|---|---|---|
| `X-PMB-Event-Type` | sim | Tipo do evento (ver 2.3) |
| `X-PMB-Event-Id` | sim | UUID **estável entre retries** (idempotência) |
| `X-PMB-Timestamp` | sim | Epoch em **segundos ou ms**; janela de 10 min |
| `X-PMB-Signature` | sim | `sha256=<hmac-hex>` (aceita também hex puro) |
| `Content-Type` | sim | `application/json` |

### 2.3. Eventos de catálogo

| `X-PMB-Event-Type` | Quando disparar | Efeito no PMB |
|---|---|---|
| `course.published` | Curso **novo** publicado, ou voltou a ficar visível | Re-sync → **cria** a linha se nova e entra na vitrine |
| `course.updated` | Curso **já publicado** foi **editado** (preço, categoria, **matriz**, conteúdo, aulas) | Re-sync → reflete a edição em tempo real |
| `course.unpublished` | Curso despublicado / oculto | Re-sync → sai da vitrine (`status = INATIVO`) |

> Os três disparam um **sync completo** do catálogo LMS (não um patch de um curso
> só). É idempotente e barato (o catálogo é pequeno).
>
> Existem ainda `course.completed`, `lesson.completed` e `student.question.created`
> (progresso do aluno e suporte) — fora do escopo deste documento.

### 2.4. Corpo do evento

Mínimo — o PMB re-puxa os dados pelos endpoints do LMS. Os campos ajudam no log:

```json
{ "courseId": "<lms-course-uuid>", "slug": "eletricista-residencial" }
```

Campos opcionais; corpo `{}` também é aceito.

### 2.5. Respostas

| HTTP | Corpo | Significado | Ação do LMS |
|---|---|---|---|
| 200 | `{"received":true,"ok":true}` | Processado | — |
| 200 | `{"received":true,"ok":false}` | Recebido, mas entidade não encontrada (retry não ajuda) | **Não** re-tentar |
| 200 | `{"received":true,"duplicate":true}` | Re-entrega já processada (idempotência) | — |
| 400 | `{"error":...}` | Evento não suportado **ou** JSON inválido | Corrigir payload |
| 401 | `{"error":"Assinatura inválida."}` | HMAC inválido ou timestamp fora da janela (10 min) | Conferir segredo/relógio |
| 503 | `{"error":"Webhook receiver não configurado."}` | `PMB_WEBHOOK_SECRET` ausente no PMB | Aguardar config |
| 500 | `{"error":"Falha ao processar — re-tente."}` | Falha transitória | **Re-tentar** com backoff |

### 2.6. Idempotência & retry

- Reenvie sempre com o **mesmo `X-PMB-Event-Id`** — o PMB deduplica entregas já
  processadas.
- Faça **retry apenas em `500`** e falhas de rede (backoff exponencial). `4xx`
  não deve ser re-tentado.

---

## 3. Contrato de leitura (PMB puxa do LMS)

Ao re-sincronizar, o PMB lê estes endpoints do LMS. A **matriz** vem em
`curriculum` e precisa estar consistente em todos:

- `GET /api/v1/courses` — lista (reconstrução completa da vitrine)
- `GET /api/v1/courses/:slug` — detalhe (página de vendas)
- `GET /api/v1/day-update?since=…` — delta diário

### Shape do curso (campos que o PMB consome)

```json
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
  "status": "published",
  "visible": true,
  "lessonCount": 6
}
```

> `curriculum` é **opcional** no contrato do PMB: se o campo **não vier**
> (`undefined`), a matriz atual no PMB **não é alterada**. Se vier `[]`, a matriz
> é **limpa de propósito**.

---

## 4. Mapeamento LMS → PMB

| Campo LMS | Campo PMB | Regra |
|---|---|---|
| `suggestedPriceCents` | `precoOriginal` (÷ 100) | Preço-base/referência. O override do admin (`precoVitrineMain`) é **preservado**. `null`/`0` → sem preço. |
| `categories[]` | `Category` + join M2M | Match por `slug`/`name` (reusa categorias existentes). **Aditivo**; a categoria principal é preservada se o admin já remapeou. |
| `curriculum[]` | `matrizCurricular` (`string[]`) | Ordena por `order`, usa o `title` de cada item. Ausente → não mexe; `[]` → limpa. |
| `status` / `visible` | `status` `ATIVO`/`INATIVO` + entra/sai da vitrine | `published` + `visible` = `ATIVO`. |
| `title` / `description` / `workload` / `lessonCount` | `nome` / `descrição` / `cargaHoraria` / `qtdAulas` | Re-sincronizados a cada evento. |

### Regras de negócio

- Curso **novo** com **preço E categoria** nasce **ATIVO** na vitrine mãe e é
  **propagado a todas as revendas** na hora.
- Curso **sem preço** fica oculto (há um gate de preço em runtime em todas as
  vitrines, além do default).
- **Matriz**: o LMS é dono do conteúdo do curso LMS → a matriz é **re-sincronizada**
  a cada evento (como descrição/aulas). Campo ausente **não apaga**; `[]` limpa.
- O sync do LMS **nunca** toca em cursos da outra fornecedora (EA).

---

## 5. Exemplo — disparo assinado (Node.js)

```js
import crypto from "node:crypto"

const SECRET = process.env.PMB_WEBHOOK_SECRET
const URL = "https://www.profissionalizamaisbrasil.com.br/api/webhooks/lms"

async function firePmbCatalog(eventType, course) {
  const body = JSON.stringify({ courseId: course.id, slug: course.slug })
  const timestamp = String(Math.floor(Date.now() / 1000)) // epoch em segundos
  const signature =
    "sha256=" +
    crypto.createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex")

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PMB-Event-Type": eventType,          // course.published | course.updated | course.unpublished
      "X-PMB-Event-Id": course.eventId,       // UUID estável entre retries
      "X-PMB-Timestamp": timestamp,
      "X-PMB-Signature": signature,
    },
    body,
  })

  // 500 / rede → re-tentar com o MESMO X-PMB-Event-Id. 4xx → não re-tentar.
  return res.status
}
```

Quando disparar:
- **Curso novo publicado** → `course.published`
- **Edição** (preço, categoria, **matriz**, conteúdo) de curso já publicado → `course.updated`
- **Despublicação/ocultação** → `course.unpublished`

---

## 6. Configuração pendente (para ligar o canal)

O receiver do PMB fica **desligado** (responde `503`) até `PMB_WEBHOOK_SECRET`
estar setado no PMB — já está previsto no ambiente. Do lado do **LMS**, configure:

- **Destino:** `https://www.profissionalizamaisbrasil.com.br/api/webhooks/lms`
- **Segredo:** `PMB_WEBHOOK_SECRET` (mesmo valor da aba **API** em `/admin/configuracoes`)

Enquanto o webhook não estiver ligado, preço/categoria/matriz continuam entrando
pelo **cron diário** e pelo **botão "Sincronizar catálogo"** do admin.
