/**
 * Tours guiados do painel do revendedor (área /painel).
 *
 * Convenções de seletor:
 *   - nav(href)        → item da sidebar:           [data-tour="nav:/painel/x"]
 *   - anchor("chave")  → âncora dentro da página:   [data-tour="chave"]
 *
 * Para criar um tour de uma página nova:
 *   1. Adicione `data-tour="<area>:<chave>"` nos controles-chave da página.
 *   2. Acrescente um TourDef aqui com `matches: exact("/painel/<rota>")`.
 *   3. Use um `id` estável "painel.<rota>" — ele é persistido em dismissedTours.
 */

import { type TourDef, type TourStep, exact } from "./types"

const nav = (href: string): string => `[data-tour="nav:${href}"]`
const anchor = (key: string): string => `[data-tour="${key}"]`

const WELCOME: TourStep = {
  title: "Bem-vindo(a)! 👋",
  description:
    "Em menos de 1 minuto vamos te mostrar onde fica cada coisa no seu painel. Use <b>Próximo</b> para avançar — ou feche no X a qualquer momento. Cada página tem o seu próprio tutorial: clique no <b>?</b> no topo sempre que quiser rever.",
}

const HELP_STEP: TourStep = {
  selector: anchor("tour-help"),
  title: "Precisa rever?",
  description:
    "Sempre que quiser, clique aqui para repetir o tutorial da página em que você estiver.",
  side: "bottom",
  align: "end",
}

// ---------------------------------------------------------------------------
// Visão geral (sidebar) — roteiros distintos por papel.
// ---------------------------------------------------------------------------

const OWNER_OVERVIEW: TourStep[] = [
  WELCOME,
  {
    selector: nav("/painel"),
    title: "Dashboard",
    description:
      "Sua visão geral: receita, alunos e conversão no período que você escolher.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/cursos"),
    title: "Catálogo",
    description:
      "Escolha quais cursos vender, defina preços e organize o que aparece na sua vitrine.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/alunos"),
    title: "Alunos",
    description:
      "Acompanhe quem comprou, status de acesso e histórico de cada aluno.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/vendas"),
    title: "Vendas diretas",
    description:
      "Registre vendas feitas por fora da vitrine (presencial, WhatsApp) e matricule o aluno na hora.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/cupons"),
    title: "Cupons",
    description: "Crie cupons de desconto para campanhas e parceiros.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/financeiro"),
    title: "Financeiro",
    description:
      "Acompanhe seu faturamento, repasses e a mensalidade da plataforma.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/indicacoes"),
    title: "Indicações",
    description:
      "Indique outros revendedores e acompanhe suas comissões de indicação.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/certificados"),
    title: "Certificados",
    description:
      "Configure o modelo e emita certificados para os alunos que concluírem.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/vitrine"),
    title: "Vitrine ✨",
    description:
      "Comece por aqui! Personalize o visual da sua loja: logo, banner, cores e seções da home.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/dominio"),
    title: "Domínio",
    description:
      "Use seu endereço grátis em livrecursos.com.br ou conecte um domínio próprio.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/configuracoes"),
    title: "Configurações",
    description:
      "Conecte sua conta do Mercado Pago para receber os pagamentos e ajuste os dados do negócio.",
    side: "right",
    align: "start",
  },
  HELP_STEP,
  {
    title: "Pronto para começar 🚀",
    description:
      "Sugestão: vá em <b>Configurações</b> para conectar o Mercado Pago e depois em <b>Vitrine</b> para deixar sua loja com a sua cara.",
  },
]

const CONSULTANT_OVERVIEW: TourStep[] = [
  WELCOME,
  {
    selector: nav("/painel"),
    title: "Dashboard",
    description:
      "Sua visão geral de vendas e desempenho no período escolhido.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/cursos"),
    title: "Catálogo",
    description: "Veja os cursos disponíveis para vender e seus preços.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/alunos"),
    title: "Alunos",
    description:
      "Acompanhe os alunos e o status de acesso de cada um.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/vendas"),
    title: "Vendas diretas",
    description:
      "Seu dia a dia: registre uma venda e matricule o aluno na hora. É aqui que você lança suas vendas.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/cupons"),
    title: "Cupons",
    description:
      "Aplique cupons de desconto respeitando o limite definido pelo seu revendedor.",
    side: "right",
    align: "start",
  },
  {
    selector: nav("/painel/financeiro"),
    title: "Financeiro",
    description: "Acompanhe as vendas que você realizou.",
    side: "right",
    align: "start",
  },
  HELP_STEP,
  {
    title: "Tudo certo 🚀",
    description:
      "Bom trabalho! Comece registrando sua primeira venda em <b>Vendas diretas</b>.",
  },
]

// ---------------------------------------------------------------------------
// Catálogo (/painel/cursos).
// ---------------------------------------------------------------------------

const CURSOS_STEPS: TourStep[] = [
  {
    title: "Seu catálogo de cursos 📚",
    description:
      "Aqui você escolhe o que vender, define preços e organiza o que aparece na sua vitrine. Vamos ver os principais controles.",
  },
  {
    selector: anchor("cursos:tabs"),
    title: "Cursos e Pacotes",
    description:
      "Alterne entre os <b>cursos</b> avulsos e os <b>pacotes</b> (combos de cursos com preço próprio).",
    side: "bottom",
    align: "start",
  },
  {
    selector: anchor("cursos:stats"),
    title: "Filtros rápidos",
    description:
      "Clique nestes cartões para filtrar por <b>visíveis</b>, <b>ocultos</b> ou <b>em destaque</b> na sua vitrine.",
    side: "bottom",
    align: "center",
  },
  {
    selector: anchor("cursos:busca"),
    title: "Buscar e ordenar",
    description:
      "Encontre um curso pelo título e ordene por preço, mais vendidos ou ordem da vitrine.",
    side: "bottom",
    align: "start",
  },
  {
    selector: anchor("cursos:bulk"),
    title: "Edição em massa",
    description:
      "Ajuste preço e visibilidade de vários cursos de uma vez — ótimo para configurar o catálogo no começo.",
    side: "left",
    align: "start",
  },
  {
    selector: anchor("cursos:lista"),
    title: "Cada curso",
    description:
      "Use o ícone do <b>olho</b> para mostrar/ocultar na vitrine e o <b>lápis</b> para editar preço, descrição, capa e destaque.",
    side: "top",
    align: "center",
  },
]

// ---------------------------------------------------------------------------
// Minha vitrine (/painel/vitrine).
// ---------------------------------------------------------------------------

const VITRINE_STEPS: TourStep[] = [
  {
    title: "Deixe a loja com a sua cara ✨",
    description:
      "Esta é a página mais importante para começar. Cada aba é uma área independente da sua vitrine — vamos passar por elas.",
  },
  {
    selector: anchor("vitrine:tabs"),
    title: "As três áreas",
    description:
      "Banner principal, seções da home e identidade visual. Clique em cada aba para editá-la separadamente.",
    side: "bottom",
    align: "start",
  },
  {
    selector: anchor("vitrine:tab:banner"),
    title: "Banner principal",
    description:
      "A primeira coisa que o visitante vê. Suba uma imagem ou vários slides (versão desktop e mobile).",
    side: "bottom",
    align: "center",
  },
  {
    selector: anchor("vitrine:tab:secoes"),
    title: "Seções da home",
    description:
      "Ligue, desligue e reordene as faixas de cursos da sua página inicial. Toda categoria nova aparece aqui automaticamente.",
    side: "bottom",
    align: "center",
  },
  {
    selector: anchor("vitrine:tab:personalizacao"),
    title: "Identidade visual",
    description:
      "Logo, cores e os detalhes da marca da sua loja ficam nesta aba.",
    side: "bottom",
    align: "center",
  },
  {
    selector: anchor("vitrine:preview"),
    title: "Ver como fica",
    description:
      "Abra sua vitrine em uma nova aba para conferir o resultado a qualquer momento.",
    side: "left",
    align: "start",
  },
]

// ---------------------------------------------------------------------------
// Registro dos tours do painel.
// ---------------------------------------------------------------------------

export const PAINEL_TOURS: TourDef[] = [
  {
    id: "painel.overview",
    area: "painel",
    label: "Visão geral (revendedor)",
    matches: exact("/painel"),
    roles: ["owner"],
    steps: OWNER_OVERVIEW,
  },
  {
    id: "painel.overview",
    area: "painel",
    label: "Visão geral (consultor)",
    matches: exact("/painel"),
    roles: ["consultant"],
    steps: CONSULTANT_OVERVIEW,
  },
  {
    id: "painel.cursos",
    area: "painel",
    label: "Catálogo",
    matches: exact("/painel/cursos"),
    steps: CURSOS_STEPS,
  },
  {
    id: "painel.vitrine",
    area: "painel",
    label: "Minha vitrine",
    matches: exact("/painel/vitrine"),
    steps: VITRINE_STEPS,
  },
  {
    id: "painel.alunos",
    area: "painel",
    label: "Alunos",
    matches: exact("/painel/alunos"),
    steps: [
      {
        title: "Seus alunos 👥",
        description:
          "Aqui você acompanha todo mundo que comprou pela sua vitrine: status, cursos e acesso. Vamos ver os controles principais.",
      },
      {
        selector: anchor("alunos:stats"),
        title: "Visão por status",
        description:
          "Um resumo rápido de quantos alunos estão <b>ativos</b>, <b>pendentes</b>, <b>bloqueados</b> e por aí vai.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("alunos:busca"),
        title: "Buscar aluno",
        description:
          "Encontre rapidamente um aluno pelo <b>nome</b> ou <b>email</b>.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("alunos:filtros"),
        title: "Filtrar a lista",
        description:
          "Filtre por status e por situação de curso/pagamento para focar em quem você precisa.",
        side: "bottom",
        align: "end",
      },
      {
        selector: anchor("alunos:lista"),
        title: "Cada aluno",
        description:
          "Clique no <b>olho</b> para ver os detalhes e use o cadeado para <b>bloquear</b> ou <b>liberar</b> o acesso às aulas.",
        side: "top",
        align: "center",
      },
    ],
  },
  {
    id: "painel.vendas",
    area: "painel",
    label: "Vendas diretas",
    matches: exact("/painel/vendas"),
    steps: [
      {
        title: "Vendas diretas 🛒",
        description:
          "Aqui ficam as vendas em que você gerou o link de pagamento manualmente (presencial, WhatsApp). As vendas pela vitrine pública aparecem em Financeiro.",
      },
      {
        selector: anchor("vendas:nova"),
        title: "Registrar uma venda",
        description:
          "Comece por aqui: cadastre o aluno, escolha o curso e gere o link de pagamento na hora.",
        side: "bottom",
        align: "end",
      },
      {
        selector: anchor("vendas:lista"),
        title: "Suas vendas",
        description:
          "Cada linha é uma venda direta, com aluno, curso, valor e a situação atual do pagamento.",
        side: "top",
        align: "center",
      },
      {
        selector: anchor("vendas:status"),
        title: "Acompanhe o pagamento",
        description:
          "O <b>status</b> mostra se a venda está pendente, paga ou cancelada — a matrícula é ativada sozinha quando é paga.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("vendas:link"),
        title: "Reenviar o link",
        description:
          "Copie o <b>link de pagamento</b> daqui para reenviar ao aluno que ainda não pagou.",
        side: "bottom",
        align: "end",
      },
    ],
  },
  {
    id: "painel.vendas-nova",
    area: "painel",
    label: "Nova venda direta",
    matches: exact("/painel/vendas/nova"),
    steps: [
      {
        title: "Nova venda 🧾",
        description:
          "Em poucos passos você cadastra o aluno, escolhe o curso e gera o link de pagamento. Vamos juntos.",
      },
      {
        selector: anchor("vendas-nova:aluno"),
        title: "Dados do aluno",
        description:
          "Informe nome, email, celular e CPF. Se o CPF já existir nos seus alunos, atualizamos os dados automaticamente.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("vendas-nova:curso"),
        title: "Escolha o curso",
        description:
          "Selecione um curso da <b>sua vitrine</b> — o preço e o tipo de pagamento são preenchidos automaticamente.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("vendas-nova:cupom"),
        title: "Cupom (opcional)",
        description:
          "Aplique um cupom de desconto, se houver. O valor final é confirmado ao gerar o link.",
        side: "left",
        align: "start",
      },
      {
        selector: anchor("vendas-nova:bolsista"),
        title: "Bolsa de estudo",
        description:
          "Marque aqui para matricular o aluno <b>sem cobrança</b> — nenhum link de pagamento é criado.",
        side: "top",
        align: "start",
      },
      {
        selector: anchor("vendas-nova:submit"),
        title: "Gerar o link",
        description:
          "Pronto! Clique para gerar o link de pagamento (ou conceder a bolsa) e enviar ao aluno.",
        side: "top",
        align: "end",
      },
    ],
  },
  {
    id: "painel.cupons",
    area: "painel",
    label: "Cupons",
    matches: exact("/painel/cupons"),
    steps: [
      {
        title: "Seus cupons de desconto 🎟️",
        description:
          "Aqui você cria códigos promocionais e acompanha quem aplicou cada um. Vamos ver os controles principais.",
      },
      {
        selector: anchor("cupons:novo"),
        title: "Criar cupom",
        description:
          "Clique aqui para abrir o formulário e definir <b>código</b>, valor do desconto e validade.",
        side: "bottom",
        align: "end",
      },
      {
        selector: anchor("cupons:resumo"),
        title: "Resumo rápido",
        description:
          "Veja de relance quantos cupons estão <b>ativos</b>, o total criado e os usos já registrados.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("cupons:lista"),
        title: "Seus cupons",
        description:
          "Cada card mostra um cupom — ative/desative e clique para ver o histórico de quem o usou.",
        side: "top",
        align: "center",
      },
    ],
  },
  {
    id: "painel.financeiro",
    area: "painel",
    label: "Financeiro",
    matches: exact("/painel/financeiro"),
    steps: [
      {
        title: "Suas finanças em um lugar 💰",
        description:
          "Acompanhe receitas, pagamentos e exporte relatórios. Vamos passar pelos controles.",
      },
      {
        selector: anchor("financeiro:periodo"),
        title: "Filtrar período",
        description:
          "Escolha o <b>intervalo de datas</b> e refine por status ou tipo de pagamento.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("financeiro:resumo"),
        title: "Visão geral",
        description:
          "Os cartões resumem a <b>receita do mês</b>, o que já foi recebido, o pendente e o que ainda vai entrar.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("financeiro:transacoes"),
        title: "Transações",
        description: "A lista detalhada de cada pagamento no período escolhido.",
        side: "top",
        align: "center",
      },
      {
        selector: anchor("financeiro:exportar"),
        title: "Exportar CSV",
        description:
          "Baixe os dados do período filtrado em uma planilha para sua contabilidade.",
        side: "bottom",
        align: "end",
      },
    ],
  },
  {
    id: "painel.indicacoes",
    area: "painel",
    label: "Indicações",
    matches: exact("/painel/indicacoes"),
    steps: [
      {
        title: "Indique e ganhe comissões 🤝",
        description:
          "Convide outros revendedores e receba comissões recorrentes. Vamos ver como acompanhar tudo.",
      },
      {
        selector: anchor("indicacoes:link"),
        title: "Seu link de indicação",
        description:
          "Copie e compartilhe este link — quem se cadastrar por ele vira seu indicado.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("indicacoes:saldo"),
        title: "Seus números",
        description:
          "Acompanhe indicados ativos e os valores <b>pendente</b>, <b>a receber</b> e já pago.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("indicacoes:pagamento"),
        title: "Como você recebe",
        description:
          "As comissões liberadas são pagas pela nossa equipe; cadastre seu <b>PIX</b> para receber.",
        side: "top",
        align: "start",
      },
      {
        selector: anchor("indicacoes:demonstrativo"),
        title: "Demonstrativo em PDF",
        description:
          "Escolha o mês e baixe o recibo das comissões pagas no período.",
        side: "top",
        align: "start",
      },
      {
        selector: anchor("indicacoes:indicados"),
        title: "Seus indicados",
        description:
          "A lista de quem você indicou, com o status de cada um e o total gerado.",
        side: "top",
        align: "start",
      },
    ],
  },
  {
    id: "painel.certificados",
    area: "painel",
    label: "Certificados",
    matches: exact("/painel/certificados"),
    steps: [
      {
        title: "Certificados dos seus alunos 🎓",
        description:
          "Aqui você define o modelo do certificado e acompanha tudo que já foi emitido. Vamos ver os principais pontos.",
      },
      {
        selector: anchor("certificados:resumo"),
        title: "Visão rápida",
        description:
          "Quantos certificados foram <b>emitidos</b>, <b>revogados</b> e qual o <b>layout</b> ativo da sua escola.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("certificados:modelo"),
        title: "Escolher o layout",
        description:
          "Selecione um dos modelos prontos — a logo da sua escola entra automaticamente no certificado.",
        side: "top",
        align: "start",
      },
      {
        selector: anchor("certificados:emitidos"),
        title: "Certificados emitidos",
        description:
          "Veja todos os certificados gerados, baixe os PDFs e revogue quando precisar.",
        side: "top",
        align: "start",
      },
      {
        selector: anchor("certificados:emitir"),
        title: "Emitir agora",
        description:
          "Gere manualmente um certificado para um aluno que concluiu o curso.",
        side: "bottom",
        align: "end",
      },
    ],
  },
  {
    id: "painel.dominio",
    area: "painel",
    label: "Domínio",
    matches: exact("/painel/dominio"),
    steps: [
      {
        title: "O endereço da sua vitrine 🌐",
        description:
          "Aqui você define onde seus alunos encontram a sua loja. Vamos ver as opções.",
      },
      {
        selector: anchor("dominio:subdominio"),
        title: "Seu endereço grátis",
        description:
          "Este subdomínio em livrecursos.com.br é gratuito e está sempre disponível para usar.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("dominio:acoes"),
        title: "Copiar ou abrir",
        description:
          "Copie o endereço para divulgar ou abra a vitrine em uma nova aba para conferir.",
        side: "left",
        align: "start",
      },
      {
        selector: anchor("dominio:custom"),
        title: "Domínio próprio",
        description:
          "Quer usar <b>seuendereco.com.br</b>? Adicione-o aqui e siga as instruções de DNS para conectar.",
        side: "top",
        align: "start",
      },
    ],
  },
  {
    id: "painel.configuracoes",
    area: "painel",
    label: "Configurações",
    matches: exact("/painel/configuracoes"),
    steps: [
      {
        title: "Ajustes da sua conta ⚙️",
        description:
          "Cada aba aqui cuida de uma parte do seu negócio. Vamos passar pelas principais.",
      },
      {
        selector: anchor("config:tabs"),
        title: "As áreas das configurações",
        description:
          "Conta, pagamento, PIX, rastreamento e segurança — clique em cada aba para abrir.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("config:conta"),
        title: "Dados da conta",
        description:
          "Nome, e-mail e os dados do seu negócio ficam nesta aba.",
        side: "bottom",
        align: "start",
      },
      {
        selector: anchor("config:pagamento"),
        title: "Conectar o Mercado Pago",
        description:
          "Comece por aqui! Conecte sua conta de recebimento para que as vendas caiam para você.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("config:pix"),
        title: "PIX das comissões",
        description:
          "Cadastre a chave PIX onde você recebe as comissões de indicação.",
        side: "bottom",
        align: "center",
      },
      {
        selector: anchor("config:seguranca"),
        title: "Segurança",
        description:
          "Altere sua senha de acesso ao painel sempre que precisar.",
        side: "bottom",
        align: "end",
      },
    ],
  },
]
