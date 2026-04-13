# Profissionaliza Mais Brasil — Blueprint do Projeto

## 1. Visão Geral

**Plataforma SaaS multi-tenant de revenda de cursos profissionalizantes.**

A Profissionaliza Mais Brasil é a operadora master que revende o sistema da Escola Avançada (white-label com API). O modelo de negócio permite que revendedores paguem uma mensalidade fixa e ganhem sua própria vitrine de cursos personalizada, com domínio próprio, para vender cursos no preço e condições que quiserem.

---

## 2. Atores do Sistema

### Admin Master (Profissionaliza Mais Brasil)
- Gerencia todo o ecossistema
- Controla catálogo de cursos (sync via API da Escola Avançada)
- Gerencia revendedores (ativar, desativar, configurar)
- Recebe mensalidades via **Asaas**
- Acessa analytics completos de toda a operação
- Define políticas de cancelamento individualmente por revendedor

### Revendedor
- Paga mensalidade fixa ao Admin Master (via Asaas)
- Possui vitrine própria com domínio personalizado (subdomínio ou domínio próprio)
- Define preços dos cursos (mensal ou pagamento único)
- Cria cupons de desconto
- Configura restrição de acesso (automática ou manual) em caso de inadimplência do aluno
- Recebe pagamentos dos alunos via **Mercado Pago** (gateway próprio)
- Acessa painel com suas vendas, alunos e relatórios

### Aluno
- Acessa a vitrine do revendedor
- Escolhe e compra o curso (checkout via Mercado Pago)
- É cadastrado automaticamente na Escola Avançada via API
- Faz aulas na plataforma da Escola Avançada

---

## 3. Fluxos Principais

### 3.1 Onboarding do Revendedor
```
Revendedor acessa site principal → Escolhe plano → Preenche cadastro
→ Pagamento da 1ª mensalidade via Asaas → Conta ativada
→ Acessa painel → Configura vitrine (logo, cores, textos)
→ Configura domínio (subdomínio automático ou domínio próprio)
→ Configura preços e condições dos cursos → Vitrine publicada
```

### 3.2 Venda de Curso (Fluxo do Aluno)
```
Aluno acessa vitrine do revendedor → Navega catálogo → Seleciona curso
→ (Opcional) Aplica cupom de desconto → Checkout via Mercado Pago
→ Pagamento confirmado (webhook) → Sistema cria aluno na Escola Avançada via API
→ Aluno recebe credenciais por email → Acessa plataforma de aulas
```

### 3.3 Cobrança Recorrente do Aluno (quando mensal)
```
Mercado Pago gera cobrança recorrente → Webhook de pagamento
→ SE pago: acesso mantido
→ SE inadimplente: comportamento definido pelo revendedor
   → Modo automático: sistema suspende acesso na Escola Avançada via API
   → Modo manual: revendedor decide quando suspender
```

### 3.4 Gestão de Mensalidade do Revendedor
```
Asaas gera cobrança mensal → Webhook de pagamento
→ SE pago: revendedor ativo
→ SE inadimplente: Admin Master decide individualmente
   → Pode suspender vitrine, desativar conta, dar prazo, etc.
```

### 3.5 Cancelamento do Revendedor
```
Admin Master decide cancelar revendedor (decisão individual)
→ Opções configuráveis por revendedor:
   - Manter alunos ativos (migrar para outro revendedor ou admin)
   - Suspender tudo imediatamente
   - Período de graça com prazo definido
→ Vitrine desativada → Domínio liberado
```

---

## 4. Arquitetura Técnica

### 4.1 Stack
| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Front-end | Next.js 14+ (App Router) | SSR, middleware multi-tenant, performance |
| Back-end | Next.js API Routes + Node.js | Unificado, serverless-ready |
| Banco de dados | PostgreSQL (Supabase) | Multi-tenant, RLS, realtime, auth built-in |
| ORM | Prisma | Type-safe, migrations, bom ecossistema |
| Autenticação | Supabase Auth + JWT custom | Admin, revendedor e aluno com roles |
| Hospedagem | Vercel | Deploy automático, domínios wildcard, edge functions |
| Cache | Redis (Upstash) | Cache de catálogo, sessões, rate limiting |

### 4.2 Multi-Tenancy (como funciona)
```
Request chega → Middleware Next.js intercepta
→ Extrai hostname (subdomínio ou domínio custom)
→ Consulta banco: qual revendedor tem esse domínio?
→ Injeta tenant_id no contexto da request
→ Toda query ao banco filtra por tenant_id
→ Layout carrega tema do revendedor (logo, cores, textos)
→ Página renderizada com identidade do revendedor
```

**Domínios:**
- Subdomínio: `revendedor.profissionalizamaisbrasil.com.br` → Vercel wildcard DNS
- Domínio próprio: `cursosjoao.com.br` → Revendedor aponta CNAME → Vercel Custom Domain API

### 4.3 Integrações

#### Asaas (Mensalidades dos Revendedores)
- **API Base:** `https://api.asaas.com/v3/` (produção) | `https://api-sandbox.asaas.com/v3/` (sandbox)
- **Autenticação:** API Key no header `access_token`
- **MCP Server disponível:** `https://docs.asaas.com/mcp` (útil para desenvolvimento)
- **Docs:** https://docs.asaas.com/reference/comece-por-aqui

##### Endpoints Utilizados

| Ação | Método | Endpoint | Descrição |
|------|--------|----------|-----------|
| Criar cliente | POST | `/v3/customers` | Cadastrar revendedor como cliente Asaas |
| Criar assinatura | POST | `/v3/subscriptions` | Criar mensalidade recorrente |
| Editar assinatura | POST | `/v3/subscriptions/{id}` | Alterar valor, forma pagamento |
| Cobranças da assinatura | GET | `/v3/subscriptions/{id}/payments` | Listar cobranças geradas |
| Criar webhook | POST | `/v3/webhooks` | Configurar recebimento de eventos |

##### Criar Cliente (Revendedor)
```json
POST /v3/customers
{
  "name": "João Revendedor",
  "cpfCnpj": "12345678900",
  "email": "joao@email.com",
  "mobilePhone": "92999999999",
  "externalReference": "tenant_abc123",  // ID do revendedor no nosso sistema
  "notificationDisabled": false,
  "groupName": "Revendedores"
}
→ Retorna: { "id": "cus_xxxx", ... }
```

##### Criar Assinatura (Mensalidade do Revendedor)
```json
POST /v3/subscriptions
{
  "customer": "cus_xxxx",
  "billingType": "PIX",           // PIX, BOLETO, CREDIT_CARD
  "nextDueDate": "2026-05-01",
  "value": 149.90,
  "cycle": "MONTHLY",
  "description": "Mensalidade Profissionaliza Mais Brasil",
  "externalReference": "tenant_abc123"
}
→ Retorna: { "id": "sub_xxxx", ... }
```

##### Webhook Events (Cobranças) — Os que precisamos escutar:
| Evento | Ação no Sistema |
|--------|----------------|
| `PAYMENT_CREATED` | Registrar nova cobrança no banco |
| `PAYMENT_CONFIRMED` | Marcar pagamento como confirmado |
| `PAYMENT_RECEIVED` | ✅ Revendedor pagou → manter status ATIVO |
| `PAYMENT_OVERDUE` | ⚠️ Cobrança vencida → notificar admin |
| `PAYMENT_DELETED` | Cobrança removida |
| `PAYMENT_REFUNDED` | Estorno processado |

##### Fluxo de Webhook por tipo de pagamento:
- **Boleto sem atraso:** PAYMENT_CREATED → PAYMENT_CONFIRMED → PAYMENT_RECEIVED
- **Pix sem atraso:** PAYMENT_CREATED → PAYMENT_RECEIVED
- **Cartão sem atraso:** PAYMENT_CREATED → PAYMENT_CONFIRMED → PAYMENT_RECEIVED (32 dias depois)
- **Com atraso (qualquer):** inclui PAYMENT_OVERDUE antes do CONFIRMED/RECEIVED

##### Payload do Webhook:
```json
{
  "id": "evt_xxxxx",
  "event": "PAYMENT_RECEIVED",
  "payment": {
    "id": "pay_xxxx",
    "customer": "cus_xxxx",
    "subscription": "sub_xxxx",      // ← identifica a assinatura
    "value": 149.90,
    "status": "RECEIVED",
    "billingType": "PIX",
    "externalReference": "tenant_abc123",  // ← identifica o revendedor
    "dueDate": "2026-05-01",
    "paymentDate": "2026-04-30"
  }
}
```

##### Segurança do Webhook:
- Token de autenticação configurável enviado no header `asaas-access-token`
- Fila de sincronização: se falhar 15x seguidas, a fila é interrompida
- Responder com HTTP 200/201 em até 22 segundos
- Eventos guardados por 14 dias

---

#### Mercado Pago (Vendas dos Cursos — Gateway do Revendedor)
- **API Base:** `https://api.mercadopago.com/`
- **Autenticação:** Bearer Token (access_token do revendedor)
- **MCP Server disponível:** `https://mcp.mercadopago.com/mcp` (com auth OAuth)
- **Docs:** https://www.mercadopago.com.br/developers/pt/docs

##### Modelo de Conexão do Revendedor
Cada revendedor conecta SUA conta Mercado Pago. O dinheiro das vendas vai direto para a conta dele.
- **Opção 1:** Revendedor fornece seu `access_token` no painel → armazenado criptografado
- **Opção 2:** OAuth do Mercado Pago → revendedor autoriza nosso app → recebemos access_token

##### Endpoints para Pagamento Único (Checkout Pro)

| Ação | Método | Endpoint | Descrição |
|------|--------|----------|-----------|
| Criar preferência | POST | `/checkout/preferences` | Gerar checkout para o aluno |
| Obter pagamento | GET | `/v1/payments/{id}` | Consultar status do pagamento |

##### Criar Preferência de Pagamento (Pagamento Único)
```javascript
// Node.js com SDK do Mercado Pago
const preference = new Preference(client);
await preference.create({
  body: {
    items: [{
      title: "Curso de Excel Avançado",
      quantity: 1,
      unit_price: 297.00
    }],
    payer: {
      email: "aluno@email.com"
    },
    back_urls: {
      success: "https://revendedor.site.com/sucesso",
      failure: "https://revendedor.site.com/falha",
      pending: "https://revendedor.site.com/pendente"
    },
    notification_url: "https://api.profissionalizamaisbrasil.com.br/webhooks/mercadopago?source_news=webhooks",
    external_reference: "enrollment_xyz123"  // ← ID da matrícula no nosso sistema
  }
});
// Retorna: { id: "preference_id", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?..." }
```

##### Endpoints para Assinatura (Curso Mensal)

| Ação | Método | Endpoint | Descrição |
|------|--------|----------|-----------|
| Criar plano | POST | `/preapproval_plan` | Definir recorrência e valor |
| Criar assinatura | POST | `/preapproval` | Assinar aluno ao plano |
| Obter assinatura | GET | `/preapproval/{id}` | Consultar status |
| Buscar assinaturas | GET | `/preapproval/search` | Listar assinaturas |
| Obter fatura | GET | `/authorized_payments/{id}` | Dados de faturamento |

##### Criar Plano de Assinatura (definido pelo revendedor)
```json
POST /preapproval_plan
{
  "reason": "Curso de Excel - Mensalidade",
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "transaction_amount": 99.90,
    "currency_id": "BRL"
  },
  "back_url": "https://revendedor.site.com/assinatura-confirmada"
}
→ Retorna: { "id": "preapproval_plan_xxxx", "init_point": "link_para_assinar" }
```

##### Criar Assinatura do Aluno
```json
POST /preapproval
{
  "preapproval_plan_id": "preapproval_plan_xxxx",
  "payer_email": "aluno@email.com",
  "external_reference": "enrollment_xyz123",
  "status": "authorized"
}
```

##### Webhook Events do Mercado Pago — Os que precisamos escutar:

| Tópico | Evento | Ação no Sistema |
|--------|--------|----------------|
| `payment` | `payment.created` | Registrar pagamento pendente |
| `payment` | `payment.updated` | Verificar se aprovado → matricular aluno |
| `subscription_preapproval` | criação/atualização | Monitorar status da assinatura |
| `subscription_authorized_payment` | fatura gerada | Verificar pagamento recorrente |

##### Payload do Webhook:
```json
{
  "id": 12345,
  "live_mode": true,
  "type": "payment",
  "action": "payment.created",
  "data": {
    "id": "999999999"       // ← ID do pagamento para consultar via GET /v1/payments/{id}
  }
}
```
**Importante:** O webhook do MP envia apenas o ID. Precisamos fazer GET no pagamento para obter detalhes completos (status, external_reference, etc.).

##### Segurança do Webhook:
- Assinatura secreta via header `x-signature` com HMAC SHA256
- Validar `ts` (timestamp) + `v1` (hash) contra a secret key da aplicação
- Responder com HTTP 200/201
- Retry automático a cada 15 min se falhar (3 tentativas)

##### Fluxo de Cupom de Desconto (aplicado ANTES de enviar ao MP):
```
Aluno aplica cupom → Sistema valida (código, validade, max_uses)
→ Calcula novo valor (percentual ou fixo)
→ Envia preferência ao MP com valor já descontado
→ Registra uso do cupom no banco
```

#### Escola Avançada (Gestão de Alunos e Cursos)
- API Doc: https://documenter.getpostman.com/view/20632445/2s93z3f5Bt
- Autenticação: Token gerado nas configurações da plataforma (enviado via form-data ou header)
- URL base: `https://SUAESCOLA.com/api/v2/`
- Formato: Todas as requests usam `multipart/form-data`
- Response padrão: `{ "erro": "", "resultado": ... }` (sempre HTTP 200, erros no campo `erro`)
- **Documentação completa de todos os 21 endpoints:** ver `escola-avancada-api-completa.md`

**21 Endpoints Mapeados (API V2) — Classificação por Prioridade:**

##### 🟢 ESSENCIAIS (9 endpoints — fluxo principal)

| # | Método | Endpoint | Descrição | Params Obrigatórios |
|---|--------|----------|-----------|---------------------|
| 1 | POST | `cursos/listar` | Catálogo completo de cursos | `token`, `categoria` (opcional) |
| 2 | POST | `cursos/aulas` | Ementa/módulos de um curso | `token`, `curso` (ID) |
| 3 | POST | `funcionarios/novo` | Criar funcionário (= revendedor na EA) | `token`, `nome`, `tipo_acesso` |
| 4 | POST | `usuarios/novo` | Matricular aluno (27+ params) | `token`, `nome` + campos do tenant |
| 5 | POST | `usuarios/editar` | Bloquear/desbloquear aluno | `token`, `id_aluno` + campos a alterar |
| 6 | POST | `usuarios/listar` | Buscar aluno por ID/CPF/email | `token` + (`id` ou `cpf` ou `email`) |
| 7 | POST | `usuarios/vinculocurso` | Vincular curso ao aluno | `token`, `aluno`, `idcurso`/`idcombo`/`categoria` |
| 8 | POST | `usuarios/cursosvinculados` | Progresso do aluno nos cursos | `token`, `id_aluno` |
| 9 | POST | `usuarios/envioemail` | Enviar credenciais por email | `token`, `aluno` |

##### 🟡 ÚTEIS (6 endpoints — painel e analytics)

| # | Método | Endpoint | Descrição | Params Obrigatórios |
|---|--------|----------|-----------|---------------------|
| 10 | POST | `financeiro/parcelas` | Carnês e parcelas do aluno | `token`, `idaluno`, `idcarner` (opcional) |
| 11 | POST | `financeiro/recebimentos` | Relatório financeiro por período | `token`, `inicial`, `final`, `status` (opcional) |
| 12 | POST | `usuarios/contrato` | Contrato PDF com assinatura digital | `token`, `idaluno` |
| 13 | POST | `usuarios/enviarmensagem` | Mensagem na área do aluno (sem HTML) | `token`, `idaluno`, `mensagem`, `idfuncionario` (opcional) |
| 14 | DELETE | `usuarios/remover_curso_combo` | Remover curso do aluno | `token`+`aluno` via HEADER, `idcurso`/`idcombo` via HEADER |
| 15 | GET | `usuarios/niver` | Aniversariantes do mês | `token` via header |

##### 🔵 BAIXA PRIORIDADE (6 endpoints — features futuras/presenciais)

| # | Método | Endpoint | Descrição | Params Obrigatórios |
|---|--------|----------|-----------|---------------------|
| 16 | POST | `usuarios/notaspresenciais` | Notas de provas presenciais | `token`, `idaluno` |
| 17 | POST | `usuarios/horarios` | Grade de horários | `token`, `idaluno`, `aulas_quant`, `dias_semanas` |
| 18 | POST | `usuarios/vincularturma` | Vincular aluno a turma | `token`, `idaluno`, `idturma` |
| 19 | DELETE | `usuarios/removerturma` | Remover aluno da turma | `token`+`idaluno`+`idturma` via HEADER |
| 20 | POST | `usuarios/listarturma` | Listar turmas do aluno | `token`, `idaluno` |
| 21 | GET | `usuarios/melhores` | Ranking melhores alunos da semana | `token` via header |

##### Campos-Chave para o Multi-Tenant
- **`polo`**: campo texto livre no aluno — identifica a unidade/revendedor. Será o slug do tenant.
- **`vendedor`**: ID do funcionário criado via `funcionarios/novo` — rastreamento de vendas.
- **`status`**: controle de acesso (ativo, inativo, bloqueado, devedor, formado, interessado)
- **`apostila`**: "liberar" / "bloquear" — controle de acesso ao material didático.
- **`funcionario_cadastro`**: quem cadastrou o aluno — rastreabilidade.

##### Respostas-Chave
- **`usuarios/novo`** → `{ login: 4017, senha: 1751278, nome: "..." }` (login = matrícula EA, senha em plain text)
- **`usuarios/listar`** → Todos os dados pessoais + login, senha, datacadastro, polo, sexo, status, apostila, vendedor, datafinal, certificado, bolsista, funcionario_cadastro
- **`usuarios/cursosvinculados`** → `[{ Curso, Data do cadastro, Situação (EM ANDAMENTO/CONCLUÍDO), Porcentagem, Data da última aula }]`
- **`cursos/listar`** → nome, aulas (qtd), preco (formato BR "1.400,00"), preco_promocional, parcelas, status, obs, categoria_interna, carga_horaria, categoria_loja, destaque, preco_mostrar, capa_image. **⚠️ NÃO retorna ID do curso.**
- **`funcionarios/novo`** → `{ login: 4016, senha: 24917334, nome: "..." }` (login = vendedor_id do tenant)
- **`usuarios/contrato`** → Link PDF + link para assinatura digital + status da assinatura

##### ⚠️ GAPS Críticos da API (e contornos)

| Funcionalidade necessária | Existe? | Contorno |
|---------------------------|---------|----------|
| Listar TODOS alunos de um polo | ❌ | Banco próprio como fonte primária |
| Deletar aluno | ❌ | `editar` com status="inativo" |
| Listar/editar funcionários | ❌ | Guardar IDs no banco durante criação |
| Criar polo/unidade | ❌ | Polo é campo texto livre no aluno |
| Obter ID do curso | ❌ | `cursos/listar` não retorna ID — manter mapa nome→ID |
| Webhook/callback | ❌ | Sync periódico via cron job |
| Buscar alunos por polo | ❌ | Sem filtro por polo no `listar` |

##### 🔧 Padrões Técnicos Importantes
1. Métodos **DELETE** enviam params via **HEADERS**, não body
2. Métodos **POST** usam **form-data**, não JSON
3. **Sem paginação** — todas as listas vêm completas
4. **Sem rate limiting** documentado — implementar retry + backoff
5. Respostas sempre **HTTP 200** — erros no campo `"erro"` do JSON
6. IDs retornados como **string em alguns, número em outros**
7. Datas em **formatos mistos** — "DD/MM/YYYY" e "YYYY-MM-DD"
8. Preços em **formato BR** — "1.400,00" (precisa parse para float)
9. **`vinculocurso` sem IDs = vincula TODOS os cursos** (cuidado!)
10. **`remover_curso_combo` sem IDs = remove TUDO** (cuidado!)

---

## 4.4 Fluxos Técnicos Integrados (3 APIs)

### Fluxo 1: Onboarding do Revendedor (Asaas + Escola Avançada)
```
1. Revendedor preenche cadastro no site
2. POST Asaas /v3/customers → criar cliente
   - externalReference = tenant_id
3. POST Asaas /v3/subscriptions → criar assinatura mensal
   - customer = cus_xxxx, cycle = MONTHLY, value = R$149,90
   - billingType = PIX (ou BOLETO/CREDIT_CARD)
4. Revendedor paga 1ª mensalidade
5. Webhook Asaas PAYMENT_RECEIVED → ativar conta do revendedor
6. POST Escola Avançada funcionarios/novo → criar funcionário para rastreio
   - Guardar ID como vendedor_id do tenant
7. Revendedor acessa painel → configura vitrine
8. Revendedor conecta conta Mercado Pago (access_token ou OAuth)
```

### Fluxo 2: Matrícula Automática (Mercado Pago + Escola Avançada)
```
PAGAMENTO ÚNICO:
1. Aluno escolhe curso na vitrine → aplica cupom (se houver)
2. POST MP /checkout/preferences → criar preferência
   - access_token = token do REVENDEDOR
   - external_reference = "tenant_abc|course_123|coupon_xyz"
   - notification_url = webhook do nosso sistema
3. Aluno é redirecionado para checkout do Mercado Pago → paga
4. Webhook MP: { type: "payment", action: "payment.updated" }
5. GET MP /v1/payments/{id} → confirmar status = "approved"
6. POST EA usuarios/novo → criar aluno
   - polo = slug do revendedor, vendedor = ID do funcionário EA
   - status = "ativo", apostila = "liberar"
   → Retorna: login + senha
7. POST EA usuarios/vinculocurso → vincular curso
   - aluno = ID retornado, idcurso = ID do curso na EA
8. POST EA usuarios/envioemail → enviar credenciais
9. Salvar enrollment no banco com escola_avancada_id + mp_payment_id

PAGAMENTO MENSAL:
1-2. Igual, mas usa POST MP /preapproval_plan + POST MP /preapproval
3. Aluno assina → 1ª cobrança automática em ~1h
4. Webhook MP: subscription_authorized_payment → GET fatura
5-9. Mesmos passos de matrícula
10. Cobranças seguintes: webhook a cada mês → verificar status
```

### Fluxo 3: Inadimplência do Aluno (Mercado Pago + Escola Avançada)
```
1. Webhook MP: pagamento da assinatura falhou/reciclando
2. Consultar config do revendedor: billing_mode
   - SE automático:
     POST EA usuarios/editar → status = "bloqueado", apostila = "bloquear"
     Notificar aluno por email
   - SE manual:
     Notificar revendedor no painel → ele decide
     Revendedor clica "bloquear" → POST EA usuarios/editar
```

### Fluxo 4: Inadimplência do Revendedor (Asaas)
```
1. Webhook Asaas: PAYMENT_OVERDUE → cobrança vencida
2. Registrar inadimplência no banco
3. Notificar admin master no painel
4. Admin decide INDIVIDUALMENTE:
   - Dar prazo extra (não faz nada no sistema)
   - Suspender vitrine → tenant.status = "suspended"
     → Vitrine mostra página de manutenção
     → Alunos continuam acessando cursos na EA (decisão por revendedor)
   - Cancelar → tenant.status = "cancelled"
     → Vitrine desativada
     → Decisão sobre alunos conforme política individual
```

### Fluxo 5: Reativação de Aluno
```
1. Webhook MP → pagamento atrasado agora aprovado
2. GET MP /v1/payments/{id} → confirmar status = "approved"
3. POST EA usuarios/editar → status = "ativo", apostila = "liberar"
4. Atualizar enrollment no banco
5. Notificar aluno
```

### Fluxo 6: Sync do Catálogo de Cursos
```
1. Cron job (1x por dia ou sob demanda via painel admin)
2. POST EA cursos/listar → buscar todos os cursos
3. Para cada curso novo: POST EA cursos/aulas → buscar lista de aulas
4. Comparar com banco local:
   - Curso novo → INSERT + notificar revendedores
   - Curso alterado → UPDATE
   - Curso removido → soft delete (manter histórico)
5. Dados sincronizados: nome, descricao, qtd_aulas, carga_horaria,
   preco_original, categoria, capa_image
```

### 4.5 Observações sobre MCP Servers
Tanto o Asaas quanto o Mercado Pago oferecem MCP Servers, o que é útil durante o desenvolvimento:

| Serviço | URL MCP | Utilidade |
|---------|---------|-----------|
| Asaas | `https://docs.asaas.com/mcp` | Buscar docs, listar endpoints, gerar código, executar chamadas |
| Mercado Pago | `https://mcp.mercadopago.com/mcp` | Buscar docs, search documentation, requer auth OAuth |

Esses MCP servers podem ser conectados ao Cursor/VS Code para auxiliar no desenvolvimento da integração.

---

## 5. Módulos do Sistema

### 5.1 Site Principal (profissionalizamaisbrasil.com.br)
- Landing page institucional
- Página "Seja um Revendedor" com planos e preços
- Checkout para contratar revenda (integração Asaas)
- Login para revendedores
- Login para admin master

### 5.2 Vitrine do Revendedor (multi-tenant)
- Homepage com banner, destaques, categorias
- Listagem de cursos com filtros (categoria, preço, duração)
- Página individual do curso (descrição, módulos, preço, CTA)
- Checkout (integração Mercado Pago do revendedor)
- Campo de cupom de desconto
- Página de confirmação / obrigado
- Layout semi-personalizável: logo, cores principais, banner, textos

### 5.3 Painel do Revendedor
- **Dashboard:** visão geral (vendas do mês, alunos ativos, receita)
- **Catálogo:** todos os cursos disponíveis com toggle de visibilidade
- **Precificação:** definir preço por curso, tipo de cobrança (única/mensal)
- **Cupons:** criar, editar, desativar cupons de desconto
- **Alunos:** lista de alunos, status de pagamento, ações (suspender/reativar)
- **Configurações da vitrine:** logo, cores, banner, textos, SEO básico
- **Domínio:** configurar subdomínio ou domínio próprio
- **Financeiro:** relatório de vendas, recebimentos, inadimplência
- **Config. de cobrança:** definir modo de restrição (automático/manual)
- **Mercado Pago:** conectar conta, status da integração

### 5.4 Painel Admin Master
- **Dashboard geral:** receita total, total de revendedores, total de alunos, cursos vendidos
- **Revendedores:** lista completa, status (ativo/inativo/inadimplente), detalhes
- **Gestão individual:** ativar, desativar, configurar política de cancelamento por revendedor
- **Financeiro Asaas:** mensalidades recebidas, inadimplentes, previsão de receita
- **Analytics por revendedor:** vendas, alunos, cursos mais vendidos, ticket médio
- **Analytics global:** tendências, comparativos, ranking de revendedores
- **Catálogo master:** cursos sincronizados da Escola Avançada, gestão do catálogo
- **Relatórios:** exportação de dados, relatórios customizados
- **Configurações:** planos de revenda, preços de mensalidade, políticas gerais

---

## 6. Modelo de Dados (Principais Entidades)

```
tenants (revendedores)
├── id, name, slug, custom_domain
├── logo_url, primary_color, secondary_color, banner_url, tagline
├── asaas_customer_id (cus_xxxx), asaas_subscription_id (sub_xxxx)
├── mp_access_token (criptografado), mp_public_key, mp_connected (boolean)
├── escola_avancada_vendedor_id (ID do funcionário criado na EA)
├── polo_name (nome do polo usado no campo "polo" da EA)
├── status (active, suspended, cancelled, pending)
├── billing_mode (auto, manual) → para inadimplência dos alunos
├── cancellation_policy (JSON flexível, definido individualmente pelo admin)
├── plan_value (valor da mensalidade paga ao admin)
├── created_at, updated_at

courses (catálogo sincronizado da Escola Avançada via cursos/listar)
├── id, escola_avancada_id
├── nome, descricao (campo "obs" da API)
├── qtd_aulas (campo "aulas"), carga_horaria
├── preco_original (campo "preco"), preco_promocional
├── parcelas_sugeridas (campo "parcelas")
├── categoria_interna, categoria_loja
├── destaque (boolean), status
├── capa_image_url (campo "capa_image")
├── synced_at

tenant_courses (config de preço por revendedor)
├── tenant_id, course_id
├── price, payment_type (one_time, monthly)
├── is_visible (boolean)
├── custom_description (opcional)

students (espelha dados de usuarios/novo + usuarios/listar da API)
├── id, tenant_id
├── nome, email, fone, fone2, cpf, rg
├── responsavel, rg_responsavel, cpf_responsavel
├── rua, bairro, cidade, estado, numero, cep
├── nascimento, sexo, obs
├── escola_avancada_id (login retornado pela API)
├── escola_avancada_senha (senha retornada - criptografada)
├── polo (= slug do revendedor, enviado à API)
├── vendedor_id (= ID do funcionário na EA, enviado à API)
├── status (ativo, bloqueado, devedor, inativo, formado, interessado)
├── apostila (liberada, bloqueada)
├── certificado, bolsista
├── datafinal
├── created_at, updated_at

enrollments (matrículas)
├── id, student_id, tenant_course_id
├── mp_subscription_id (preapproval_xxxx, se mensal)
├── mp_payment_id (se pagamento único)
├── mp_preference_id (preference_xxxx)
├── external_reference (tenant_id|course_id|coupon_id)
├── status (active, suspended, cancelled, pending)
├── payment_type (one_time, monthly)
├── original_amount, discount_amount, final_amount
├── started_at, expires_at

payments (registro de cada pagamento recebido)
├── id, enrollment_id, tenant_id
├── amount, type (one_time, recurring)
├── mp_payment_id, mp_status (approved, pending, rejected, etc.)
├── mp_payment_type (credit_card, pix, boleto, account_money)
├── coupon_id (se aplicado)
├── paid_at, created_at

coupons
├── id, tenant_id
├── code, discount_type (percentage, fixed)
├── discount_value, max_uses, used_count
├── valid_from, valid_until, is_active

tenant_payments (mensalidades dos revendedores)
├── id, tenant_id
├── asaas_payment_id, amount
├── status, due_date, paid_at

admin_users
├── id, email, role (super_admin, admin)

webhook_logs
├── id, source (asaas, mercado_pago, escola_avancada)
├── event_type, payload (JSON)
├── processed, created_at
```

---

## 7. Infraestrutura Recomendada

### Hospedagem
- **Vercel** (front + API routes) — suporte nativo a wildcard domains e custom domains via API
- **Supabase** (PostgreSQL + Auth + Storage) — banco, autenticação, storage para logos/banners
- **Upstash Redis** — cache de catálogo, sessões, rate limiting de webhooks

### Domínios
- `profissionalizamaisbrasil.com.br` → site principal
- `*.profissionalizamaisbrasil.com.br` → wildcard para subdomínios de revendedores
- Custom domains via Vercel API → para revendedores com domínio próprio

### Estimativa de Custo Mensal (início)
| Serviço | Plano | Custo estimado |
|---------|-------|---------------|
| Vercel | Pro | ~$20/mês |
| Supabase | Pro | ~$25/mês |
| Upstash Redis | Pay-as-you-go | ~$5/mês |
| Domínio | .com.br | ~R$40/ano |
| **Total** | | **~$50/mês (~R$275)** |

---

## 8. Roadmap de Implementação

## 8.1 Limitações e Riscos Identificados

### Escola Avançada — Limitações da API

1. **Token único por escola** — Todos os revendedores usam o mesmo token. O isolamento é feito pelos campos `polo` e `vendedor`, não por tokens separados. Risco: qualquer endpoint pode acessar/modificar alunos de outro polo.

2. **Sem endpoint de deletar aluno** — Só é possível `editar` com status="inativo". Alunos nunca são removidos da EA.

3. **Sem webhook/callback** — API é apenas request/response. Mudanças feitas direto na EA não são notificadas. Solução: sync periódico via cron + banco próprio como fonte primária.

4. **Sem listagem em massa por polo** — `usuarios/listar` busca individual (id/cpf/email). Impossível listar todos os alunos de um revendedor via API. Banco local é obrigatório.

5. **Credenciais em plain text** — `usuarios/novo` e `usuarios/listar` retornam senha em texto. Armazenar criptografada + usar `usuarios/envioemail` para envio seguro.

6. **Sem rate limiting documentado** — Implementar retry com exponential backoff + fila para operações em lote (onboarding com muitos alunos).

7. **Campo `polo` = texto livre** — Não há validação ou criação de polo na API. Depende de padronização rigorosa no nosso sistema (slug único, imutável).

8. **`cursos/listar` não retorna ID do curso** — Retorna nome, preço, aulas etc., mas sem ID. Precisaremos descobrir os IDs (testar com a API) ou manter mapa nome→ID manual.

9. **Operações destrutivas sem IDs removem tudo** — `vinculocurso` sem idcurso vincula TODOS. `remover_curso_combo` sem idcurso remove TODOS. Implementar validação rígida no backend.

10. **Métodos DELETE usam HEADERS** — Padrão não-convencional: params de DELETE vão nos headers, não no body. Necessário adaptar o HTTP client.

### Limitações e Observações do Asaas

8. **Webhook com fila sequencial** — Se o sistema falhar em responder 15 vezes seguidas, a fila de webhooks é interrompida. Eventos são guardados por apenas 14 dias. Implementar processamento rápido (retornar 200 imediatamente, processar em background).

9. **Assinatura gera cobranças independentes** — A assinatura do Asaas é um "agendador" que cria cobranças. Para saber se foi paga, escutamos o webhook de COBRANÇA (não de assinatura). O campo `subscription` no payload identifica a qual assinatura pertence.

10. **Sandbox disponível** — Ambiente de testes em `api-sandbox.asaas.com` com conta separada. Ideal para desenvolvimento.

### Limitações e Observações do Mercado Pago

11. **Webhook envia apenas o ID** — Diferente do Asaas que envia o payload completo, o MP envia apenas `{ data: { id } }`. Precisamos fazer um GET adicional para obter detalhes do pagamento.

12. **Cada revendedor = 1 access_token** — O access_token do revendedor é necessário para criar preferências e consultar pagamentos na conta DELE. Armazenar criptografado.

13. **Assinatura MP usa redirecionamento** — O aluno é redirecionado para o Mercado Pago para assinar. Não há checkout transparente para assinaturas. OK para nosso caso.

14. **Validação HMAC SHA256 obrigatória** — O MP envia header `x-signature` com timestamp + hash. Implementar validação para segurança contra webhooks falsos.

15. **Checkout Pro redireciona para o MP** — O aluno sai da vitrine do revendedor para pagar no Mercado Pago. Isso é bom (segurança, confiança) mas tira o controle visual. Alternativa futura: Checkout Bricks (inline, mais customizável).

16. **Cupons são aplicados no NOSSO sistema** — O valor enviado ao MP já é o valor com desconto. O MP não sabe da existência do cupom. Precisamos registrar no banco.

---

### Fase 1 — Fundação (Semanas 1-2)
- Setup do projeto Next.js + Prisma + Supabase
- Schema do banco de dados + migrations
- Sistema de autenticação (admin, revendedor)
- Middleware multi-tenant (resolução de domínio)
- CRUD básico de revendedores

### Fase 2 — Integrações Core (Semanas 3-4)
- Integração Escola Avançada API (sync de cursos, criar aluno, matricular)
- Integração Asaas (criar cliente, assinatura, webhooks)
- Integração Mercado Pago (checkout, webhooks, OAuth por revendedor)

### Fase 3 — Vitrine do Revendedor (Semanas 5-6)
- Layout da vitrine (homepage, listagem, página do curso)
- Sistema de temas (cores, logo, banner por tenant)
- Checkout completo com cupom de desconto
- Fluxo automático: pagamento → criação do aluno → matrícula

### Fase 4 — Painéis (Semanas 7-8)
- Painel do revendedor (dashboard, precificação, alunos, cupons, config)
- Painel admin master (dashboard, gestão de revendedores, financeiro)

### Fase 5 — Analytics e Polish (Semanas 9-10)
- Relatórios financeiros completos (admin e revendedor)
- Analytics: vendas, alunos, cursos, ranking, tendências
- Exportação de dados (CSV/PDF)

### Fase 6 — Site Principal + Go-Live (Semanas 11-12)
- Landing page principal da Profissionaliza Mais Brasil
- Página "Seja um Revendedor" + checkout de adesão
- Testes end-to-end de todos os fluxos
- Configuração de domínios e DNS
- Deploy em produção
