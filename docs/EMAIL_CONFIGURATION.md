# Configuração de Email — Profissionaliza Mais Brasil

> Caminho ÚNICO de envio: **SMTP da Hostinger**. Todo email do sistema sai por
> `src/lib/email/mailer.ts` → `sendEmail()`. Resend existe só como fallback de
> código; em produção usamos SMTP.

## Causa raiz do "usuários não recebem email"

`sendEmail()` escolhe o provedor em `pickProvider()`:

1. **SMTP** se `SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD` + `SMTP_PORT` estiverem **todos** definidos.
2. **Resend** se `RESEND_API_KEY` existir.
3. Senão, **lança `EmailError`** — nenhum email é enviado.

Se essas variáveis estiverem **vazias em produção**, TODO envio nosso falha
silenciosamente (vai para `EmailLog` com `status=FAILED`). Os emails de
credenciais que o aluno ainda recebe vêm da **plataforma de aulas (EA)**, não do
nosso SMTP — por isso "alguns" emails chegam e a maioria não.

## Variáveis de ambiente (Vercel → Production)

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465                 # 465 (SSL) ou 587 (STARTTLS)
SMTP_USER=nao-responda@profissionalizamaisbrasil.com.br
SMTP_PASSWORD=<senha da caixa Hostinger>
SMTP_FROM="Profissionaliza Mais Brasil <nao-responda@profissionalizamaisbrasil.com.br>"
```

- Para Hostinger, `SMTP_USER` é o **email completo** (com domínio) e `SMTP_PASSWORD`
  é a senha da caixa.
- O endereço de envio é sempre o da PMB (caixa autenticada). Emails de revenda
  trocam apenas o **nome de exibição** (`emailFromForBrand`) — o endereço-base
  permanece o da PMB, então a autenticação de domínio precisa ser do domínio PMB.

### Como conferir se está setado

Vercel dashboard → projeto → **Settings → Environment Variables** → ambiente
**Production**. Confirme que as 5 variáveis acima têm valor. (Um `.env.vercel.production`
com elas vazias enquanto outros segredos têm valor é sinal de que nunca foram
configuradas.)

## Deliverability — SPF / DKIM / DMARC

Sem autenticação de domínio, mesmo com SMTP configurado os emails caem em spam.
No DNS de `profissionalizamaisbrasil.com.br` (Hostinger/registrador):

| Registro | Host | Valor (exemplo — confirme no painel Hostinger) |
|---|---|---|
| SPF (TXT) | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` |
| DKIM (TXT) | `hostingermail._domainkey` | chave pública gerada pela Hostinger |
| DMARC (TXT) | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@profissionalizamaisbrasil.com.br` |

Validar em https://mxtoolbox.com (SPF/DKIM) e enviar um teste para o Gmail
conferindo `DKIM=pass` / `SPF=pass` nos cabeçalhos.

## Observabilidade

Toda tentativa de envio é registrada em **`EmailLog`** (`status` SENT/FAILED,
`provider`, `error`, `tenantId`). Para diagnosticar não-entrega:

```sql
SELECT status, template, error, count(*)
FROM email_logs
WHERE created_at > now() - interval '1 day'
GROUP BY 1, 2, 3
ORDER BY count DESC;
```

`status=FAILED` em massa com `provider=unknown` ⇒ nenhum provedor configurado
(setar `SMTP_*`). `provider=smtp` com erros de timeout ⇒ revisar rede/credenciais.

## Confiabilidade de disparo

- Envios em rotas/webhooks usam `afterResponse()` (`src/lib/after-response.ts`):
  rodam **após** a resposta HTTP, sem bloquear o webhook nem serem cortados pelo
  congelamento da função serverless (o `void fetch`/promise solta era cortado).
- O transporter SMTP (`src/lib/email/smtp.ts`) tem `connectionTimeout`,
  `socketTimeout`, `greetingTimeout` e `pool` — uma conexão pendurada vira um
  `EmailError` rápido e auditável em vez de travar a função.

## Cobertura de eventos

- **Transacionais dedicados** (templates próprios): boas-vindas ao painel,
  matrícula/novo curso, reset de senha, onboarding de revenda, credenciais de
  equipe, convites, confirmação/atraso/estorno de mensalidade (revenda),
  pagamento aguardando (`payment-pending`) e recusado (`payment-rejected`) do aluno.
- **Ponte notificação→email** (`src/lib/notifications.ts`): notificações in-app
  das categorias `payment`, `enrollment`, `sale`, `certificate`, `referral`,
  `tenant-billing`, `fulfillment` também viram email (template `notification`),
  respeitando `NotificationPreference.email` e os kill-switches de categoria.
  As demais categorias seguem só in-app — ajuste `EMAIL_BRIDGE_CATEGORIES` para
  incluir/excluir categorias.
