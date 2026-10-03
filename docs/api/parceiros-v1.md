# API de Parceiros — v1

API de saída do PMB para **sistemas de terceiros**. Dado um identificador único
de uma pessoa ou de uma unidade, devolve os dados completos da **unidade
(revenda)** correspondente: id, slug, subdomínio, domínio próprio, contato,
redes sociais, identidade visual e titular.

O caso de uso típico: o sistema parceiro recebe um contato (e-mail, CPF,
telefone, ou o domínio pelo qual a pessoa chegou), consulta esta API e passa a
responder com a marca, os links e os canais **daquela unidade** em vez dos da
PMB.

- **Base URL:** `https://www.profissionalizamaisbrasil.com.br/api/v1`
  — **com `www`**. Sem ele o domínio responde `307` para o `www`, e a maioria
  dos clientes HTTP (curl, `fetch`, n8n) descarta o `Authorization` ao seguir o
  redirecionamento: a chamada chega sem chave e volta `401`.
- **Formato:** JSON (`application/json`), UTF-8
- **Versionamento:** o caminho carrega a versão. Campo novo na resposta é
  retrocompatível e pode entrar sem aviso; remoção ou mudança de significado
  exige `/api/v2`.

---

## 1. Autenticação

Toda requisição precisa de uma chave de API. Envie em **um** destes headers:

```http
Authorization: Bearer pmb_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

```http
X-API-Key: pmb_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

A chave é emitida pela equipe PMB em **/admin/configuracoes → aba API**, uma por
sistema integrado. Ela aparece **uma única vez**, no momento em que é criada — o
PMB guarda apenas o hash. Perdeu, peça uma nova e revogue a antiga.

Cada chave carrega **escopos**. Consulta de unidade exige `unidades.read`;
criação de unidade (seção 6) exige `unidades.create`. Dê a cada chave só o
escopo que a integração usa.

> **Guarde a chave como senha de produção.** Ela nunca deve ir para código
> versionado, front-end, app mobile ou log. Chame esta API sempre a partir do
> seu servidor.

### Verificar a credencial

```http
GET /api/v1/ping
```

Não exige escopo — serve para o seu dev confirmar que a chave chegou correta
antes de depurar qualquer consulta.

```json
{
  "ok": true,
  "data": {
    "autenticado": true,
    "chave": { "nome": "CRM da rede", "prefixo": "pmb_live_a1b2c3d4" },
    "escopos": ["unidades.read"],
    "versao": "v1"
  }
}
```

---

## 2. Consultar a unidade

```http
GET /api/v1/unidades/lookup?<identificador>=<valor>
```

Escopo: `unidades.read`. Informe **exatamente um** identificador por requisição.

| Parâmetro   | De quem / o quê                    | Observações |
|-------------|------------------------------------|-------------|
| `email`     | Titular da unidade                 | Único. Caminho preferido. |
| `cpf`       | Titular da unidade                 | Com ou sem máscara. Dígito verificador é validado antes de ir ao banco. |
| `telefone`  | Titular da unidade                 | Aceita `+55`, com ou sem máscara. **Não é único** — pode devolver `409`. |
| `id`        | Unidade                            | Id interno (cuid). |
| `slug`      | Unidade                            | É também o subdomínio da vitrine. |
| `dominio`   | Unidade                            | Domínio próprio. Aceita URL completa e `www.`. |
| `codigo`    | Unidade                            | Código de indicação. |
| `q`         | Qualquer um dos acima              | A API deduz o tipo. Conveniência, não contrato — veja a nota abaixo. |

> **Sobre o `q`:** CPF e celular com DDD têm 11 dígitos — a dedução resolve pelo
> dígito verificador do CPF, o que acerta na prática. Já `slug`, `id` e `codigo`
> são indistinguíveis pela forma, então a API procura pelos **três de uma vez**
> (são colunas únicas: no máximo uma casa) e informa em `encontradoPor.tipo`
> qual delas de fato casou. Ainda assim: se o tipo importa para o seu fluxo,
> use o campo nomeado e não dependa da adivinhação.

### Atalho por caminho

```http
GET /api/v1/unidades/{identificador}
```

Mesma dedução do `q`, com o valor no path (lembre de fazer *percent-encoding* em
e-mails). Útil quando você já tem o slug ou o id:

```http
GET /api/v1/unidades/cursos-do-joao
```

### Exemplos

```bash
# Por e-mail do titular
curl -H "Authorization: Bearer $PMB_API_KEY" \
  "https://www.profissionalizamaisbrasil.com.br/api/v1/unidades/lookup?email=joao@exemplo.com.br"

# Por CPF (com ou sem máscara)
curl -H "X-API-Key: $PMB_API_KEY" \
  "https://www.profissionalizamaisbrasil.com.br/api/v1/unidades/lookup?cpf=529.982.247-25"

# Por domínio próprio (aceita a URL inteira)
curl -H "X-API-Key: $PMB_API_KEY" \
  --get --data-urlencode "dominio=https://www.cursosdojoao.com.br/curso/x" \
  "https://www.profissionalizamaisbrasil.com.br/api/v1/unidades/lookup"
```

---

## 3. Resposta

```json
{
  "ok": true,
  "data": {
    "encontradoPor": { "tipo": "email", "valor": "joao@exemplo.com.br" },
    "unidade": {
      "id": "clg8x2k9p0001abcdefghijk",
      "nome": "Cursos do João",
      "slug": "cursos-do-joao",
      "status": "ACTIVE",
      "ativa": true,
      "codigoIndicacao": "JOAO2026",

      "dominio": {
        "subdominio": "cursos-do-joao.livrecursos.com.br",
        "urlSubdominio": "https://cursos-do-joao.livrecursos.com.br",
        "proprio": "cursosdojoao.com.br",
        "proprioVerificado": true,
        "url": "https://cursosdojoao.com.br"
      },

      "contato": {
        "whatsapp": "11987654321",
        "whatsappFormatado": "(11) 98765-4321",
        "email": "contato@cursosdojoao.com.br",
        "horarioAtendimento": "Seg a Sex, 9h às 18h"
      },

      "redesSociais": {
        "instagram": "https://instagram.com/cursosdojoao",
        "facebook": null,
        "youtube": null,
        "tiktok": null
      },

      "identidadeVisual": {
        "logoUrl": "https://…/logo.png",
        "faviconUrl": "https://…/favicon.png",
        "bannerUrl": "https://…/banner.jpg",
        "corPrimaria": "#2563eb",
        "corSecundaria": "#1e40af",
        "tagline": "Sua carreira começa aqui",
        "descricao": "Unidade credenciada em Campinas…"
      },

      "titular": {
        "id": "clg8x2k9p0002abcdefghijk",
        "nome": "João da Silva",
        "email": "joao@exemplo.com.br",
        "telefone": "11987654321",
        "telefoneFormatado": "(11) 98765-4321",
        "cpfMascarado": "***.982.247-**"
      },

      "recursos": {
        "automacao": true,
        "vendaDeRevendas": false,
        "unidadeTecnica": { "habilitada": false, "url": null, "rotulo": null },
        "eja": { "habilitada": true, "url": "https://…", "rotulo": "EJA" }
      },

      "criadaEm": "2026-01-15T13:00:00.000Z",
      "ativadaEm": "2026-01-20T10:22:00.000Z",
      "atualizadaEm": "2026-08-01T18:44:12.000Z"
    }
  }
}
```

### Notas de contrato

- **`status`** — `PENDING` (aguardando 1º pagamento), `ACTIVE`, `SUSPENDED`
  (inadimplente), `CANCELLED`. O booleano `ativa` é só um atalho para
  `status === "ACTIVE"`. **Consulte-o**: a API devolve unidades suspensas e
  canceladas de propósito (você precisa saber que existem para tratar o caso),
  e não é o PMB quem decide o que o seu sistema faz com elas.
- **`dominio.url`** — URL canônica da vitrine: o domínio próprio quando existe,
  senão o subdomínio. Use este campo para montar links.
- **`titular.cpfMascarado`** — o CPF completo **não** é devolvido. Quem consulta
  por CPF já tem o número; quem consulta por outro campo não passa a ter. Se a
  sua integração precisar do CPF completo, fale com a equipe PMB: é decisão de
  LGPD, não limitação técnica.
- **Nunca são devolvidos:** credenciais de gateway (Mercado Pago, Asaas),
  segredos de webhook, valor de mensalidade, regras e faixas de comissão, chave
  PIX de recebimento, dados de alunos. Se a sua integração precisa de algo
  dessa lista, é outro endpoint e outro escopo — peça.

---

## 4. Erros

Todo erro vem no mesmo envelope. **Ramifique no `code`, não na mensagem** — o
texto pode mudar.

```json
{
  "ok": false,
  "error": { "message": "Nenhuma unidade encontrada para este identificador.", "code": "NOT_FOUND" }
}
```

| HTTP | `code` | Quando acontece |
|------|--------|-----------------|
| 400 | `MISSING_IDENTIFIER` | Nenhum identificador informado, ou mais de um ao mesmo tempo. |
| 400 | `INVALID_IDENTIFIER` | O valor não tem forma válida (CPF com DV errado, e-mail malformado, slug com caractere proibido). |
| 401 | `INVALID_API_KEY` | Chave ausente, malformada, desconhecida, revogada ou expirada. **A resposta não distingue os casos** — é proposital. |
| 403 | `INSUFFICIENT_SCOPE` | Chave válida, mas sem o escopo que a rota exige. |
| 404 | `NOT_FOUND` | Nenhuma unidade casou com o identificador. |
| 409 | `MULTIPLE_MATCHES` | Só em `telefone`: mais de um titular tem o número. Repita a consulta por e-mail, CPF ou slug. |
| 400 | `VALIDATION_ERROR` | Só no `POST /unidades`: JSON inválido ou campo faltando/fora do formato. `details` traz os campos. |
| 403 | `FORBIDDEN` | Só no `POST /unidades`: a regra de negócio recusou a criação. |
| 409 | `CONFLICT` | Só no `POST /unidades`: slug indisponível ou e-mail do titular já cadastrado. |
| 429 | `RATE_LIMITED` | Limite de requisições da chave estourado. `details.retryAfterSec` diz quanto esperar. |
| 500 | `INTERNAL_ERROR` | Falha no PMB. Pode repetir. |

### Limite de requisições

**120 requisições por minuto, por chave** (não por IP — o limite acompanha o
contrato, não a máquina de saída). Ao estourar, o `429` traz
`details.retryAfterSec`.

Se a sua integração consulta o mesmo identificador com frequência, **cacheie a
resposta** por alguns minutos. Os dados de uma unidade mudam raramente.

---

## 5. Implementação do lado do parceiro

Exemplo em Node (o mesmo desenho vale para qualquer linguagem):

```js
const BASE = "https://www.profissionalizamaisbrasil.com.br/api/v1"

async function buscarUnidade(campo, valor) {
  const url = `${BASE}/unidades/lookup?${campo}=${encodeURIComponent(valor)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.PMB_API_KEY}` },
  })
  const body = await res.json()

  if (res.ok) return body.data.unidade

  switch (body.error?.code) {
    case "NOT_FOUND":
      return null                       // pessoa não é de nenhuma unidade
    case "MULTIPLE_MATCHES":
      return null                       // telefone repetido: tente por e-mail
    case "RATE_LIMITED":
      throw new Error(`retry em ${body.error.details.retryAfterSec}s`)
    default:
      throw new Error(`PMB ${res.status}: ${body.error?.code}`)
  }
}
```

Checklist antes de subir:

1. A chave está numa variável de ambiente do **servidor** — nunca no cliente.
2. `GET /api/v1/ping` responde `200` no ambiente de produção do parceiro.
3. `404` é tratado como "não encontrado", não como erro de sistema — a maioria
   dos contatos consultados **não** vai ser de uma unidade.
4. Há cache e *backoff* no `429`.
5. O `status` da unidade é levado em conta antes de exibi-la como ativa.

---

## 6. Criar unidade (escopo `unidades.create`)

```http
POST /api/v1/unidades
Content-Type: application/json
Authorization: Bearer pmb_live_xxx
```

```json
{
  "nome": "Cursos do João",
  "slug": "cursos-do-joao",
  "plano": "pro",
  "parcelasPrimeiraMensalidade": 1,
  "titular": {
    "nome": "João da Silva",
    "email": "joao@exemplo.com.br",
    "cpfCnpj": "529.982.247-25",
    "telefone": "31999998888"
  }
}
```

| Campo | Obrigatório | Regra |
|-------|-------------|-------|
| `nome` | sim | 2–80 caracteres. |
| `slug` | não | 3–32, letras minúsculas, números e hífen. Ausente = derivado do `nome`. Vira o subdomínio da vitrine. |
| `plano` | sim | `profissionaliza` (R$ 209) ou `pro` (R$ 239, já liga o módulo de Automação). Não há outro valor: cortesia, promoção e preço livre são só pelo /admin. |
| `parcelasPrimeiraMensalidade` | não | 1–12, teto do cartão na 1ª mensalidade. Padrão 1. |
| `titular.nome` / `email` / `cpfCnpj` | sim | O e-mail vira o login do titular e não pode já existir. |
| `titular.telefone` | não | 8–20 caracteres. |

Resposta `201`:

```json
{
  "ok": true,
  "data": {
    "unidade": {
      "id": "clx…", "slug": "cursos-do-joao", "nome": "Cursos do João",
      "status": "PENDING", "vitrineUrl": "https://cursos-do-joao.livrecursos.com.br"
    },
    "titular": { "id": "clx…", "email": "joao@exemplo.com.br" },
    "pagamento": {
      "url": "https://profissionalizamaisbrasil.com.br/cobranca/pay_abc123",
      "cobrancaId": "pay_abc123",
      "valor": 239,
      "plano": "pro",
      "erro": null
    },
    "emailOnboardingEnviado": true
  }
}
```

- **`pagamento.url` é o checkout transparente do PMB**: PIX (QR e copia e cola),
  boleto e cartão parcelado na própria página. Envie esse link ao titular.
- A unidade nasce `PENDING` e vira `ACTIVE` quando a 1ª mensalidade é paga.
  Para saber se pagou, consulte `GET /api/v1/unidades/{slug}` e olhe `status`.
- O titular recebe por e-mail o login e a senha temporária. A API **não**
  devolve senha. Com `emailOnboardingEnviado: false`, ele entra pelo
  "Esqueci minha senha" com o mesmo e-mail.
- **`pagamento.url: null` com a unidade criada** = a cobrança não saiu no
  gateway (`pagamento.erro` diz por quê). **Não repita o POST**: ele responderia
  `409`. Avise a equipe PMB, que reemite a cobrança pelo /admin.
- **Sem idempotência por chave.** Timeout ou erro de rede no meio: consulte
  `GET /api/v1/unidades/lookup?email=<titular>` antes de tentar de novo. Um
  `409 CONFLICT` no retry quase sempre significa "a primeira tentativa criou".
- Limite: **30 criações por minuto por chave**.

---

## 7. Exemplos curl (todas as rotas)

```bash
export PMB_API_KEY=pmb_live_xxx
BASE=https://www.profissionalizamaisbrasil.com.br/api/v1

# Verificar a chave (qualquer escopo)
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/ping"

# Consultar unidade — um identificador por chamada (escopo unidades.read)
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/lookup?email=joao@exemplo.com.br"
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/lookup?cpf=52998224725"
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/lookup?telefone=31999998888"
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/lookup?slug=cursos-do-joao"
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/lookup?id=<id-da-unidade>"
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/lookup?dominio=www.cursosdojoao.com.br"
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/lookup?codigo=<codigo-de-indicacao>"
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/lookup?q=joao@exemplo.com.br"

# Consultar pelo caminho (tipo deduzido)
curl -H "Authorization: Bearer $PMB_API_KEY" "$BASE/unidades/cursos-do-joao"

# Criar unidade (escopo unidades.create)
curl -X POST "$BASE/unidades" \
  -H "Authorization: Bearer $PMB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Cursos do João",
    "plano": "pro",
    "titular": {
      "nome": "João da Silva",
      "email": "joao@exemplo.com.br",
      "cpfCnpj": "52998224725",
      "telefone": "31999998888"
    }
  }'
```

---

## 8. Webhooks (PMB → seu sistema)

Cadastro em **/admin/configuracoes → aba API → Webhooks de saída**: nome, URL
`https://` e os eventos desejados. O segredo de assinatura (`whsec_…`) aparece
**uma vez**, ao cadastrar (ou ao clicar em *Trocar segredo*). Sem webhook
cadastrado, nenhum evento sai.

### Eventos

| Evento | Quando |
|--------|--------|
| `unidade.criada` | Unidade criada pelo /admin, painel, API ou cadastro público. |
| `unidade.pagamento.confirmado` | Mensalidade da unidade paga (Asaas, baixa manual ou reconciliação). |
| `unidade.pagamento.vencido` | Mensalidade venceu sem pagamento (sai mesmo dentro da carência). |
| `unidade.pagamento.estornado` | Mensalidade estornada, total ou parcial (`pagamento.status` diz qual). |
| `unidade.ativada` | Unidade passou a `ACTIVE` (1º pagamento ou reativação). |
| `unidade.suspensa` | Unidade passou a `SUSPENDED`. |
| `unidade.cancelada` | Unidade passou a `CANCELLED`. |
| `webhook.teste` | Só pelo botão *Enviar teste*. Não é assinável. |

### Requisição

```http
POST <sua URL>
Content-Type: application/json
X-PMB-Event-Id: evt_3f2a…          (igual entre tentativas)
X-PMB-Event-Type: unidade.pagamento.confirmado
X-PMB-Timestamp: 1759406400        (epoch em segundos)
X-PMB-Signature: sha256=<hex>
```

```json
{
  "id": "evt_3f2a…",
  "evento": "unidade.pagamento.confirmado",
  "criadoEm": "2026-10-02T12:00:00.000Z",
  "dados": {
    "unidade": { "…": "mesmo bloco de GET /unidades/lookup (seção 3)" },
    "pagamento": {
      "cobrancaId": "pay_abc123",
      "valor": 239,
      "status": "RECEIVED",
      "formaPagamento": "PIX",
      "vencimento": "2026-10-05",
      "pagoEm": "2026-10-02T11:58:00.000Z",
      "url": "https://profissionalizamaisbrasil.com.br/cobranca/pay_abc123"
    },
    "origem": "asaas"
  }
}
```

- `dados.pagamento` só existe em `unidade.pagamento.*`. Os eventos de status
  trazem `dados.statusAnterior`.
- `origem`: `asaas` | `manual` | `cron` | `api` | `admin` | `painel` | `cadastro`.
- `pagamento.url` é `null` em mensalidade parcelada no cartão (já autorizada).
- O mesmo pagamento confirmado por dois caminhos (Asaas + baixa manual,
  `CONFIRMED` + `RECEIVED`) gera **um** evento só.

### Conferir a assinatura

`HMAC-SHA256(segredo, "<X-PMB-Timestamp>.<corpo cru>")` em hex. Use o corpo
**cru**, antes de qualquer `JSON.parse`.

```js
import crypto from "node:crypto"

function assinaturaValida(rawBody, headers, segredo) {
  const ts = headers["x-pmb-timestamp"]
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false // anti-replay
  const esperado = crypto.createHmac("sha256", segredo).update(`${ts}.${rawBody}`).digest("hex")
  const recebido = String(headers["x-pmb-signature"] ?? "").replace(/^sha256=/, "")
  return recebido.length === esperado.length &&
    crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
}
```

### Entrega e novas tentativas

- Responda **2xx em até 10 s**. Qualquer outra coisa, **inclusive redirect**,
  conta como falha.
- Novas tentativas em 1 min, 5 min, 30 min, 2 h, 6 h e 24 h. Esgotou, a entrega
  fica como *Falhou* e pode ser reenviada na tela.
- Entrega **pelo menos uma vez**: guarde o `X-PMB-Event-Id` e descarte o que já
  processou.
- A tela mostra as últimas 30 entregas de cada webhook, com o payload, o código
  HTTP e o erro.

---

## 9. Operação (lado PMB)

- **Emitir chave:** /admin/configuracoes → aba **API** → *Chaves de acesso dos
  parceiros* → *Gerar chave*. Exige a permissão `integracoes.manage`. Copie o
  segredo na hora: ele não é exibido de novo.
- **Revogar:** mesma tela. Efeito imediato, e só derruba aquele parceiro. A
  linha é preservada (trilha), e o segredo revogado nunca volta a valer.
- **Auditoria:** criação, alteração e revogação entram em `audit_logs`
  (`api_key.create` / `api_key.update` / `api_key.revoke`), com quem, o quê e
  quando. O segredo nunca entra no log.
- **Telemetria:** a listagem mostra último uso, IP e total de chamadas — use
  antes de revogar uma chave que talvez ainda esteja em produção.
- **Nenhuma chave ativa = API fechada.** Enquanto ninguém emitir uma, todo
  `/api/v1` responde `401`.

### Código

| Onde | O quê |
|------|-------|
| `src/lib/api-parceiros/keys.ts` | Geração, hash e autenticação da chave |
| `src/lib/api-parceiros/scopes.ts` | Catálogo fechado de escopos |
| `src/lib/api-parceiros/identificador.ts` | Classificação/normalização do identificador |
| `src/lib/api-parceiros/lookup.ts` | Consulta ao banco |
| `src/lib/api-parceiros/unidade-payload.ts` | **Fronteira de dados** — allowlist do que sai |
| `src/app/api/v1/**` | Rotas públicas |
| `src/lib/api-parceiros/gate.ts` | Portaria das rotas: teto por IP, chave + escopo, teto por chave |
| `src/lib/resellers/create.ts` | Núcleo da criação de unidade (o mesmo do /admin e do painel) |
| `src/lib/webhooks-saida/` | Webhooks de saída: catálogo de eventos, assinatura, fila e entrega |
| `src/app/api/admin/webhooks/**` | Gestão dos webhooks |
| `src/app/api/cron/webhooks-entregas` | Novas tentativas (pg_cron `pmb-webhooks-entregas`, a cada 5 min) |
| `src/app/api/admin/api-keys/**` | Gestão das chaves |

Para expor um recurso novo (alunos, matrículas, catálogo…), crie **escopo
próprio** em `scopes.ts` e uma allowlist própria de campos. Não amplie
`unidades.read` nem o payload da unidade — chave existente passaria a enxergar
o que o parceiro não contratou.
