# Como conectar o Mercado Pago à sua loja

Este guia mostra como ligar a **sua conta do Mercado Pago** à sua loja, para que
os pagamentos dos seus alunos sejam recebidos por você e as matrículas sejam
liberadas **automaticamente** assim que o pagamento for aprovado.

Você vai fazer isso **uma única vez**. Leva cerca de 10 minutos.

> Você vai precisar de **três informações** do Mercado Pago, nesta ordem:
> 1. A **Public Key** de produção
> 2. O **Access Token** de produção
> 3. A **assinatura secreta** do webhook
>
> As três são coladas no seu painel, em **Configurações → Pagamento**, na mesma
> ordem em que os campos aparecem lá.

**Por que a ordem importa:** a Public Key e o Access Token saem da **mesma tela**
de credenciais e já existem assim que você cria a aplicação. Já a assinatura
secreta **só é gerada depois** que você cadastra a URL de notificação — por isso
ela é a última.

---

## Antes de começar

- Tenha uma **conta no Mercado Pago** (a mesma onde você quer receber o dinheiro).
- Faça login no Mercado Pago **na mesma conta** durante todo o processo.
- Deixe a aba do **seu painel** aberta em **Configurações → Pagamento** — o passo
  a passo completo está lá, e é de lá que você copia a URL do Passo 4.

---

## Passo 1 — Abrir o painel de desenvolvedores e criar a aplicação

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

📎 Ajuda oficial: [Onde encontro as credenciais?](https://www.mercadopago.com.br/ajuda/onde-encontro-credenciais_20214)
· [Credenciais (documentação)](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials)

---

## Passo 2 — Copiar a Public Key

Na tela de **Credenciais de produção**, o **primeiro** campo é a **Public Key**.

1. Copie o valor (começa com `APP_USR-...`).
2. Cole no seu painel, no campo **Public Key (produção)**.

> A Public Key é o que monta a tela de pagamento **dentro da sua loja**: o aluno
> digita o cartão no seu site, sem ser redirecionado para o Mercado Pago. Sem
> ela, o checkout não abre.

---

## Passo 3 — Copiar o Access Token

Na **mesma tela**, logo abaixo da Public Key, está o **Access Token**.

1. Copie o valor (também começa com `APP_USR-...`).
2. Cole no seu painel, no campo **Access Token (produção)**.

- ⚠️ Use as **credenciais de PRODUÇÃO**, não as de teste.
- ⚠️ Esse token é secreto — não compartilhe com ninguém além do nosso painel.
  Ele é criptografado antes de ser salvo e ninguém da equipe vê o valor.

---

## Passo 4 — Cadastrar a URL de notificação (webhook)

O *webhook* é o aviso que o Mercado Pago envia ao nosso sistema quando um
pagamento é aprovado. É ele que dispara a matrícula automática.

1. Ainda dentro da sua aplicação, no menu lateral clique em **Webhooks**
   (ou **Notificações → Webhooks**):
   👉 **https://www.mercadopago.com.br/developers/panel/app**

2. Clique em **Configurar notificação** e selecione o modo **Produção**.

3. No campo **URL**, cole a **URL do webhook da sua loja**.
   - Essa URL está no **seu painel**, em **Configurações → Pagamento**, no
     Passo 4 do tutorial — clique em **Copiar** e cole aqui.
   - Ela tem este formato (com o nome da sua loja no final):
     `https://www.profissionalizamaisbrasil.com.br/api/webhooks/mercadopago?tenant=SUA-LOJA`
   - Cole a URL **inteira**, incluindo o trecho depois do `?`.

4. Em **Eventos**, marque:
   - ✅ **Pagamentos** (obrigatório)
   - ✅ **Planos e assinaturas / Assinaturas** (marque também se você vende cursos
     em formato de **mensalidade**)

5. Clique em **Salvar**.

📎 Ajuda oficial: [Webhooks (documentação)](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)

---

## Passo 5 — Copiar a assinatura secreta

Depois de salvar o webhook do Passo 4, o Mercado Pago mostra a
**assinatura secreta** (também chamada de *chave secreta* / *secret signature*),
na própria tela de Webhooks.

1. Clique para **revelar** e **copie** esse valor.
2. Cole no seu painel, no campo **Assinatura secreta do webhook**.

- ⚠️ Sem essa chave, a matrícula automática **não funciona**: o aluno paga e não
  recebe o acesso.
- Se ainda não conseguiu gerá-la, você pode salvar sem ela e voltar depois — o
  painel mostra um aviso amarelo com o campo para cadastrá-la.

---

## Passo 6 — Salvar no seu painel

1. Volte ao **seu painel** → **Configurações → Pagamento**.
2. Confira os três campos preenchidos (Public Key, Access Token e assinatura
   secreta).
3. Clique em **Salvar e conectar Mercado Pago**.

✅ Pronto! Quando o status mostrar **Conectado** (em verde) e os três itens do
checklist estiverem verdes, está tudo certo. Se aparecer
**"Conexão incompleta"** (em amarelo), o próprio painel indica qual item falta.

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
| Status fica em **"Conexão incompleta"** | Olhe o checklist do card: o item amarelo diz o que falta (Public Key ou assinatura secreta). |
| **Não acho a Public Key / o Access Token** | Elas ficam **dentro da aplicação** (developers → sua aplicação → Credenciais de produção), não na conta comum do Mercado Pago. |
| Aluno paga mas **não é matriculado** | Confirme que a **URL** colada no Mercado Pago é exatamente a do seu painel e que o evento **Pagamentos** está marcado. |
| Mercado Pago acusa **URL inválida** ao salvar | Use a URL **completa** copiada do painel (com `https://www.` no começo e `?tenant=...` no final). |
| Usei o token de **teste** | Troque pelas **credenciais de produção** (`APP_USR-...`). |
| Não acho a **assinatura secreta** | Ela só aparece **depois de salvar** a configuração de Webhook (Passo 4), na própria tela de Webhooks. |
| Erro **"conta não é do Brasil"** | Use uma conta do Mercado Pago **brasileira** (BRL) — é ela que recebe em reais. |

---

## Importante

- O dinheiro das vendas cai **direto na sua conta do Mercado Pago**.
- Seus tokens são **criptografados** antes de serem salvos — ninguém da equipe vê
  o valor.
- Você pode **desconectar** a qualquer momento em Configurações → Pagamento.

---

### Links rápidos

- Painel do Mercado Pago (Suas integrações): https://www.mercadopago.com.br/developers/panel/app
- Onde encontro as credenciais: https://www.mercadopago.com.br/ajuda/onde-encontro-credenciais_20214
- Documentação de Credenciais: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials
- Documentação de Webhooks: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
