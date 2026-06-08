# Como conectar o Mercado Pago à sua loja

Este guia mostra como ligar a **sua conta do Mercado Pago** à sua loja, para que
os pagamentos dos seus alunos sejam recebidos por você e as matrículas sejam
liberadas **automaticamente** assim que o pagamento for aprovado.

Você vai fazer isso **uma única vez**. Leva cerca de 10 minutos.

> Você vai precisar de **duas informações** do Mercado Pago:
> 1. O **Access Token de produção**
> 2. A **Chave secreta** do webhook (assinatura)
>
> Os dois são colados no seu painel, em **Configurações → Pagamentos**.

---

## Antes de começar

- Tenha uma **conta no Mercado Pago** (a mesma onde você quer receber o dinheiro).
- Faça login no Mercado Pago **na mesma conta** durante todo o processo.
- Deixe a aba do **seu painel** aberta em **Configurações → Pagamentos** — você
  vai copiar uma URL de lá no Passo 2.

---

## Passo 1 — Pegar o Access Token de produção

1. Acesse o painel de desenvolvedores (Suas integrações):
   👉 **https://www.mercadopago.com.br/developers/panel/app**

2. Se ainda não tiver uma aplicação, clique em **Criar aplicação**:
   - Dê um nome (ex.: *Minha Loja de Cursos*).
   - Em tipo de solução / produto, escolha **Pagamentos online** (Checkout Pro / CheckoutAPI).
   - Conclua a criação.

3. Abra a sua aplicação e, no menu lateral, clique em
   **Credenciais de produção**.
   - Pode ser que o Mercado Pago peça para você **ativar as credenciais de
     produção** preenchendo alguns dados do seu negócio. Faça isso.

4. Copie o **Access Token** (começa com `APP_USR-...`).
   - ⚠️ Use as **credenciais de PRODUÇÃO**, não as de teste.
   - ⚠️ Esse token é secreto — não compartilhe com ninguém além do nosso painel.

📎 Ajuda oficial: [Onde encontro as credenciais?](https://www.mercadopago.com.br/ajuda/onde-encontro-credenciais_20214)
· [Credenciais (documentação)](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials)

---

## Passo 2 — Configurar o webhook e pegar a Chave secreta

O *webhook* é o aviso que o Mercado Pago envia ao nosso sistema quando um
pagamento é aprovado. É ele que dispara a matrícula automática.

1. Ainda dentro da sua aplicação, no menu lateral clique em **Webhooks**
   (ou **Notificações → Webhooks**):
   👉 **https://www.mercadopago.com.br/developers/panel/app**

2. Clique em **Configurar notificação** e selecione o modo **Produção**.

3. No campo **URL**, cole a **URL do webhook da sua loja**.
   - Essa URL está no **seu painel**, em **Configurações → Pagamentos**, no bloco
     *"URL de notificação (webhook)"* — clique em **Copiar** e cole aqui.
   - Ela tem este formato (com o nome da sua loja no final):
     `https://www.profissionalizamaisbrasil.com.br/api/webhooks/mercadopago?tenant=SUA-LOJA`

4. Em **Eventos**, marque:
   - ✅ **Pagamentos** (obrigatório)
   - ✅ **Planos e assinaturas / Assinaturas** (marque também se você vende cursos
     em formato de **mensalidade**)

5. Clique em **Salvar**.

6. Após salvar, o Mercado Pago mostra a **Chave secreta** (também chamada de
   *assinatura secreta* / *secret signature*). Clique para **revelar** e
   **copie** esse valor.
   - ⚠️ Sem essa chave, a matrícula automática **não funciona**.

📎 Ajuda oficial: [Webhooks (documentação)](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)

---

## Passo 3 — Colar as informações no seu painel

1. Volte ao **seu painel** → **Configurações → Pagamentos**.

2. Clique em **Conectar gateway de pagamento** (ou, se já estiver conectado,
   no aviso para cadastrar a assinatura).

3. Preencha:
   - **Access Token MP** → o token do **Passo 1** (`APP_USR-...`).
   - **Assinatura secreta do webhook** → a chave do **Passo 2**.

4. Clique em **Salvar**.

✅ Pronto! Quando o status mostrar **Conectado** (em verde), está tudo certo.
Se aparecer **"Conectado · falta assinatura"** (em amarelo), volte ao Passo 2 e
cadastre a chave secreta.

---

## Como saber se funcionou

- No painel do Mercado Pago (tela de Webhooks), use o botão **Simular** para
  enviar uma notificação de teste — deve retornar **sucesso**.
- Na prática, faça uma compra de teste de baixo valor na sua loja: ao aprovar o
  pagamento, o aluno deve ser **matriculado automaticamente** e receber o e-mail
  de acesso em poucos minutos.

---

## Problemas comuns

| Situação | O que fazer |
|---|---|
| Status fica em **"falta assinatura"** | Você colou o token mas não a Chave secreta. Refaça o Passo 2 e cadastre a chave. |
| Aluno paga mas **não é matriculado** | Confirme que a **URL** colada no Mercado Pago é exatamente a do seu painel e que o evento **Pagamentos** está marcado. |
| Mercado Pago acusa **URL inválida** ao salvar | Use a URL **completa** copiada do painel (com `https://www.` no começo e `?tenant=...` no final). |
| Usei o token de **teste** | Troque pelas **credenciais de produção** (`APP_USR-...`). |
| Não acho a **Chave secreta** | Ela só aparece **depois de salvar** a configuração de Webhook, na própria tela de Webhooks. |

---

## Importante

- O dinheiro das vendas cai **direto na sua conta do Mercado Pago**.
- Seus tokens são **criptografados** antes de serem salvos — ninguém da equipe vê
  o valor.
- Você pode **desconectar** a qualquer momento em Configurações → Pagamentos.

---

### Links rápidos

- Painel do Mercado Pago (Suas integrações): https://www.mercadopago.com.br/developers/panel/app
- Onde encontro as credenciais: https://www.mercadopago.com.br/ajuda/onde-encontro-credenciais_20214
- Documentação de Credenciais: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials
- Documentação de Webhooks: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
