import { AutomationTemplateKey } from "@prisma/client"

// Templates default criados na 1a ativacao do modulo Automacao para um tenant.
// Cada tenant pode editar/desligar individualmente em /painel/automacao/mensagens.
// Placeholders disponiveis (interpolados em src/lib/automation/templates.ts):
//   {{aluno_nome}} {{curso}} {{escola}} {{link_curso}} {{valor}}
export const DEFAULT_AUTOMATION_TEMPLATES: Array<{
  key: AutomationTemplateKey
  body: string
}> = [
  {
    key: "FORM_SUBMITTED",
    body:
      "Olá {{aluno_nome}}! Aqui é da {{escola}}. Recebemos seu interesse no curso de {{curso}}. Em breve um de nossos consultores entra em contato. Se preferir falar agora, basta responder esta mensagem.",
  },
  {
    key: "CHECKOUT_ABANDONED",
    body:
      "Oi {{aluno_nome}}, tudo bem? Notamos que você começou a matrícula no curso de {{curso}} pela {{escola}} mas não finalizou. Posso te ajudar com alguma dúvida? Se quiser retomar, é só clicar aqui: {{link_curso}}",
  },
  {
    key: "PURCHASE_CONFIRMED",
    body:
      "Parabéns, {{aluno_nome}}! Seu pagamento do curso {{curso}} foi confirmado. Você receberá em instantes um e-mail com seus dados de acesso. Bons estudos! — Equipe {{escola}}.",
  },
  {
    key: "WELCOME",
    body:
      "Olá {{aluno_nome}}, seja muito bem-vindo(a) à {{escola}}! Estou à disposição para qualquer dúvida sobre cursos, certificação e matrícula.",
  },
]
