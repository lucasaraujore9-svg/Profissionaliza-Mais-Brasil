/**
 * Tours guiados da área do aluno (/aluno).
 *
 * Mesmas convenções de painel.ts:
 *   - nav(href)        → item da sidebar:   [data-tour="nav:/aluno/x"]
 *   - anchor("chave")  → âncora na página:  [data-tour="chave"]
 */

import { type TourDef, type TourStep, exact } from "./types"

const nav = (href: string): string => `[data-tour="nav:${href}"]`
const anchor = (key: string): string => `[data-tour="${key}"]`

const HELP_STEP: TourStep = {
  selector: anchor("tour-help"),
  title: "Precisa rever?",
  description:
    "Sempre que quiser, clique aqui para repetir o tutorial da página em que você estiver.",
  side: "bottom",
  align: "end",
}

const OVERVIEW: TourStep[] = [
  {
    title: "Bem-vindo à sua área de aluno! 🎓",
    description:
      "Vamos te mostrar rapidinho onde fica cada coisa. Use <b>Próximo</b> para avançar — ou feche no X quando quiser.",
  },
  {
    selector: nav("/aluno"),
    title: "Visão geral",
    description:
      "Seu ponto de partida: cursos em andamento, avisos e atalhos do dia a dia.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/aluno/cursos"),
    title: "Meus cursos",
    description:
      "Acesse aqui as aulas dos cursos que você comprou e acompanhe seu progresso.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/aluno/certificados"),
    title: "Certificados",
    description:
      "Ao concluir um curso, seu certificado aparece aqui para baixar.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/aluno/comprar"),
    title: "Comprar curso",
    description:
      "Quer aprender mais? Veja a vitrine e compre novos cursos sem sair da sua área.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/aluno/pagamentos"),
    title: "Pagamentos",
    description: "Consulte o histórico das suas compras e a situação de cada uma.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/aluno/suporte"),
    title: "Suporte",
    description:
      "Precisa de ajuda? Fale com a equipe por aqui — respondemos por e-mail.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/aluno/perfil"),
    title: "Meu perfil",
    description: "Atualize seus dados e sua senha de acesso quando precisar.",
    side: "right",
    align: "start",
  },
  HELP_STEP,
  {
    title: "Bons estudos! 🚀",
    description:
      "Sugestão: comece em <b>Meus cursos</b> para entrar na sua primeira aula.",
  },
]

export const ALUNO_TOURS: TourDef[] = [
  {
    id: "aluno.overview",
    area: "aluno",
    label: "Visão geral (aluno)",
    matches: exact("/aluno"),
    steps: OVERVIEW,
  },
  {
    id: "aluno.cursos",
    area: "aluno",
    label: "Meus cursos",
    matches: exact("/aluno/cursos"),
    steps: [
      {
        title: "Seus cursos ficam aqui 🎓",
        description:
          "Esta é a sua estante: todos os cursos que você comprou aparecem nesta página.",
      },
      {
        selector: anchor("aluno-cursos:lista"),
        title: "Sua lista de cursos",
        description:
          "Cada cartão é um curso seu, com a capa, a situação e o que fazer em seguida.",
        side: "top",
        align: "center",
      },
      {
        selector: anchor("aluno-cursos:progresso"),
        title: "Seu progresso",
        description:
          "A barrinha mostra <b>quanto do curso você já concluiu</b> — ela enche conforme você assiste às aulas.",
        side: "top",
        align: "start",
      },
      {
        selector: anchor("aluno-cursos:acessar"),
        title: "Entrar nas aulas",
        description:
          "Use o botão verde para <b>acessar as aulas</b>; ao concluir, o botão do certificado aparece aqui também.",
        side: "top",
        align: "center",
      },
    ],
  },
  {
    id: "aluno.comprar",
    area: "aluno",
    label: "Comprar curso",
    matches: exact("/aluno/comprar"),
    steps: [
      {
        title: "Vamos comprar um novo curso? 🛒",
        description:
          "Aqui você escolhe um curso do catálogo e finaliza a compra sem precisar digitar seus dados de novo.",
      },
      {
        selector: anchor("aluno-comprar:busca"),
        title: "Encontre seu curso",
        description:
          "Digite o nome ou a categoria para <b>achar rapidinho</b> o curso que você quer.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("aluno-comprar:catalogo"),
        title: "Catálogo de cursos",
        description:
          "Veja os cursos disponíveis com preço e formas de pagamento em cada cartão.",
        side: "top",
        align: "center",
      },
      {
        selector: anchor("aluno-comprar:comprar"),
        title: "Comprar agora",
        description:
          "Clique em <b>Comprar agora</b> e você vai direto para o pagamento (Pix, cartão ou boleto).",
        side: "top",
        align: "center",
      },
    ],
  },
  {
    id: "aluno.certificados",
    area: "aluno",
    label: "Meus certificados",
    matches: exact("/aluno/certificados"),
    steps: [
      {
        title: "Seus certificados 🏅",
        description:
          "Concluiu um curso? Seu certificado aparece aqui, pronto para visualizar, baixar e compartilhar.",
      },
      {
        selector: anchor("aluno-certificados:lista"),
        title: "Certificados disponíveis",
        description:
          "Cada cartão é um certificado de um curso que você já concluiu.",
        side: "top",
        align: "center",
      },
      {
        selector: anchor("aluno-certificados:codigo"),
        title: "Código de validação",
        description:
          "Este <b>código único</b> permite que qualquer pessoa confirme que seu certificado é verdadeiro.",
        side: "top",
        align: "start",
      },
      {
        selector: anchor("aluno-certificados:baixar"),
        title: "Baixar o PDF",
        description:
          "Clique em <b>Baixar PDF</b> para salvar o certificado no seu aparelho e imprimir quando quiser.",
        side: "top",
        align: "center",
      },
    ],
  },
  {
    id: "aluno.pagamentos",
    area: "aluno",
    label: "Pagamentos",
    matches: exact("/aluno/pagamentos"),
    steps: [
      {
        title: "Seus pagamentos 💳",
        description:
          "Aqui você acompanha tudo que comprou e o que ainda está em aberto. Use <b>Próximo</b> para conhecer cada parte.",
      },
      {
        selector: anchor("aluno-pagamentos:resumo"),
        title: "Resumo rápido",
        description:
          "Num piscar de olhos: o total que você já pagou e quantas cobranças ainda estão em aberto.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("aluno-pagamentos:pendentes"),
        title: "Cobranças em aberto",
        description:
          "Tem algo a pagar? Aparece aqui com o botão <b>Pagar agora</b> para você quitar na hora.",
        side: "top",
        align: "center",
      },
      {
        selector: anchor("aluno-pagamentos:lista"),
        title: "Histórico de pagamentos",
        description:
          "Todos os pagamentos confirmados ficam guardados aqui, com data, curso, situação e valor.",
        side: "top",
        align: "center",
      },
    ],
  },
  {
    id: "aluno.suporte",
    area: "aluno",
    label: "Suporte",
    matches: exact("/aluno/suporte"),
    steps: [
      {
        title: "Precisa de ajuda? 💬",
        description:
          "Esta é a sua central de atendimento. Vamos te mostrar como falar com a equipe.",
      },
      {
        selector: anchor("aluno-suporte:canais"),
        title: "Canais rápidos",
        description:
          "Quer uma resposta mais ágil? Fale pelo <b>WhatsApp</b> ou <b>email</b> direto por aqui.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("aluno-suporte:novo"),
        title: "Mande sua dúvida",
        description:
          "Escreva o assunto e a mensagem, e a equipe responde pelo seu email ou nas notificações da conta.",
        side: "top",
        align: "center",
      },
      {
        selector: anchor("aluno-suporte:faq"),
        title: "Perguntas frequentes",
        description:
          "Antes de perguntar, dá uma olhada aqui: muitas dúvidas comuns já têm resposta rapidinha.",
        side: "top",
        align: "center",
      },
    ],
  },
  {
    id: "aluno.perfil",
    area: "aluno",
    label: "Meu perfil",
    matches: exact("/aluno/perfil"),
    steps: [
      {
        title: "Seu perfil 🧑‍🎓",
        description:
          "Aqui você mantém seus dados em dia e cuida da sua senha de acesso. Vamos ver como?",
      },
      {
        selector: anchor("aluno-perfil:dados"),
        title: "Seus dados",
        description:
          "Atualize nome, contato e endereço quando precisar. Lembre-se de clicar em <b>Salvar dados</b>.",
        side: "top",
        align: "center",
      },
      {
        selector: anchor("aluno-perfil:senha"),
        title: "Sua senha",
        description:
          "Defina ou troque sua senha de acesso a este painel sempre que quiser, com segurança.",
        side: "top",
        align: "center",
      },
    ],
  },
]
