import {
  PrismaClient,
  UserRole,
  TenantStatus,
  BillingMode,
  DiscountType,
} from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from "bcryptjs"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

/**
 * Renumera as seções da home do PMB (tenant_id IS NULL) para a ordem canônica.
 * Inline (sem importar app code, que usa outro client + alias) — espelha
 * `reorderScopeToCanonical` de src/lib/home/sections.ts e a migration
 * 20260620_eja_idiomas_reposition. Idempotente.
 */
async function reorderPmbHomeCanonical() {
  const catRows = await prisma.homeSection.findMany({
    where: {
      id: {
        in: [
          "pmb-cat-informatica",
          "pmb-cat-administrativo",
          "pmb-idiomas",
          "pmb-cat-diversas",
        ],
      },
    },
    select: { id: true, config: true },
  })
  const catId = (id: string) =>
    (catRows.find((r) => r.id === id)?.config as { categoryId?: string } | null)
      ?.categoryId ?? null
  const cats = {
    inf: catId("pmb-cat-informatica"),
    adm: catId("pmb-cat-administrativo"),
    idi: catId("pmb-idiomas"),
    div: catId("pmb-cat-diversas"),
  }
  const rank = (kind: string, config: unknown): number => {
    const cfg = (config ?? {}) as { variant?: string; categoryId?: string }
    switch (kind) {
      case "institutional":
        if (cfg.variant === "trust_bar") return 0
        if (cfg.variant === "learn_anywhere") return 7
        if (cfg.variant === "final_cta") return 9
        if (cfg.variant === "testimonials") return 11
        return 1000
      case "bestsellers":
        return 1
      case "category_courses":
        if (cats.inf && cfg.categoryId === cats.inf) return 2
        if (cats.adm && cfg.categoryId === cats.adm) return 4
        if (cats.idi && cfg.categoryId === cats.idi) return 6
        if (cats.div && cfg.categoryId === cats.div) return 8
        return 1000
      case "categories_grid":
        return 3
      case "eja":
        return 5
      case "tecnica":
        return 10
      default:
        return 1000
    }
  }
  const sections = await prisma.homeSection.findMany({
    where: { tenantId: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, config: true, position: true },
  })
  const sorted = sections
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const diff = rank(a.s.kind, a.s.config) - rank(b.s.kind, b.s.config)
      return diff !== 0 ? diff : a.i - b.i
    })
    .map((x) => x.s)
  const updates = sorted
    .map((s, idx) => ({ id: s.id, pos: idx, oldPos: s.position }))
    .filter((u) => u.oldPos !== u.pos)
  for (const u of updates) {
    await prisma.homeSection.update({
      where: { id: u.id },
      data: { position: u.pos },
    })
  }
}

async function main() {
  const adminPwd = await bcrypt.hash("super123", 10)
  const salesPwd = await bcrypt.hash("vendas123", 10)
  const mgrPwd = await bcrypt.hash("gerente123", 10)
  const resellerPwd = await bcrypt.hash("teste123", 10)

  const superAdmin = await prisma.user.upsert({
    where: { email: "super@pmb.com.br" },
    update: { role: UserRole.SUPER_ADMIN, status: "ATIVO" },
    create: {
      email: "super@pmb.com.br",
      name: "Super Admin",
      passwordHash: adminPwd,
      role: UserRole.SUPER_ADMIN,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  // Compat: legado admin@pmb.com.br
  await prisma.user.upsert({
    where: { email: "admin@pmb.com.br" },
    update: { role: UserRole.SUPER_ADMIN },
    create: {
      email: "admin@pmb.com.br",
      name: "Admin Legado",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: UserRole.SUPER_ADMIN,
      updatedAt: new Date(),
    },
  })

  const sales = await prisma.user.upsert({
    where: { email: "vendas@pmb.com.br" },
    update: { role: UserRole.PMB_SALES, status: "ATIVO" },
    create: {
      email: "vendas@pmb.com.br",
      name: "Vendas PMB",
      passwordHash: salesPwd,
      role: UserRole.PMB_SALES,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  const mgr = await prisma.user.upsert({
    where: { email: "gerente@pmb.com.br" },
    update: { role: UserRole.PMB_RESELLER_MGR, status: "ATIVO" },
    create: {
      email: "gerente@pmb.com.br",
      name: "Gerente Revendedores",
      passwordHash: mgrPwd,
      role: UserRole.PMB_RESELLER_MGR,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  // Diretor de unidades: mesmo trabalho do gerente acima, porém sobre a rede
  // inteira (unidades.viewAll no preset). Sem carteira atribuída de propósito —
  // é justamente o papel que não depende de accountManagerId para enxergar.
  await prisma.user.upsert({
    where: { email: "diretor@pmb.com.br" },
    update: { role: UserRole.PMB_RESELLER_DIRECTOR, status: "ATIVO" },
    create: {
      email: "diretor@pmb.com.br",
      name: "Diretor de Unidades",
      passwordHash: await bcrypt.hash("diretor123", 10),
      role: UserRole.PMB_RESELLER_DIRECTOR,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  await prisma.user.upsert({
    where: { email: "designer@pmb.com.br" },
    update: { role: UserRole.PMB_DESIGNER, status: "ATIVO" },
    create: {
      email: "designer@pmb.com.br",
      name: "Designer PMB",
      passwordHash: await bcrypt.hash("designer123", 10),
      role: UserRole.PMB_DESIGNER,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  // Tenant 1 (com gerente) + Tenant 2 (sem gerente)
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: "revenda1" },
    update: { accountManagerId: mgr.id },
    create: {
      slug: "revenda1",
      name: "Revenda Um",
      status: TenantStatus.ACTIVE,
      billingMode: BillingMode.MANUAL,
      planValue: 99.9,
      tagline: "Cursos profissionalizantes",
      accountManagerId: mgr.id,
      referralCode: "REVENDA1-SEED",
      updatedAt: new Date(),
    },
  })

  const tenant2 = await prisma.tenant.upsert({
    where: { slug: "revenda2" },
    update: { accountManagerId: null },
    create: {
      slug: "revenda2",
      name: "Revenda Dois",
      status: TenantStatus.ACTIVE,
      billingMode: BillingMode.MANUAL,
      planValue: 99.9,
      accountManagerId: null,
      referralCode: "REVENDA2-SEED",
      updatedAt: new Date(),
    },
  })

  // Compat: tenant demo legado
  await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "Vitrine Demo",
      status: TenantStatus.ACTIVE,
      billingMode: BillingMode.MANUAL,
      planValue: 99.9,
      referralCode: "DEMO-SEED",
      updatedAt: new Date(),
    },
  })

  // Owners dos tenants
  const owner1 = await prisma.user.upsert({
    where: { email: "revenda1@teste.com" },
    update: { tenantId: tenant1.id },
    create: {
      email: "revenda1@teste.com",
      name: "Dono Revenda 1",
      passwordHash: resellerPwd,
      role: UserRole.RESELLER,
      tenantId: tenant1.id,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  await prisma.user.upsert({
    where: { email: "revenda2@teste.com" },
    update: { tenantId: tenant2.id },
    create: {
      email: "revenda2@teste.com",
      name: "Dono Revenda 2",
      passwordHash: resellerPwd,
      role: UserRole.RESELLER,
      tenantId: tenant2.id,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  // Compat legado
  await prisma.user.upsert({
    where: { email: "revendedor@teste.com" },
    update: {},
    create: {
      email: "revendedor@teste.com",
      name: "Revendedor Demo",
      passwordHash: resellerPwd,
      role: UserRole.RESELLER,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  // Consultor do tenant1 (User sem tenantId, ligado via TenantMember)
  const consultor = await prisma.user.upsert({
    where: { email: "consultor1@teste.com" },
    update: {},
    create: {
      email: "consultor1@teste.com",
      name: "Consultor Um",
      passwordHash: resellerPwd,
      role: UserRole.RESELLER,
      status: "ATIVO",
      updatedAt: new Date(),
    },
  })

  await prisma.tenantMember.upsert({
    where: {
      tenantId_userId: { tenantId: tenant1.id, userId: consultor.id },
    },
    update: { role: "consultant", status: "ATIVO", maxDiscount: 20 },
    create: {
      tenantId: tenant1.id,
      userId: consultor.id,
      role: "consultant",
      status: "ATIVO",
      maxDiscount: 20,
    },
  })

  // Cursos (5, 2 em destaque na home)
  const cursos = [
    {
      nome: "Excel Avancado",
      slug: "excel-avancado",
      categoriaLoja: "Tecnologia",
      qtdAulas: 40,
      cargaHoraria: "120h",
      precoOriginal: 197.0,
      precoVitrineMain: 147.0,
      destaqueHome: true,
      ordemHome: 1,
    },
    {
      nome: "Marketing Digital",
      slug: "marketing-digital",
      categoriaLoja: "Marketing",
      qtdAulas: 35,
      cargaHoraria: "100h",
      precoOriginal: 297.0,
      precoVitrineMain: 197.0,
      destaqueHome: true,
      ordemHome: 2,
    },
    {
      nome: "Programacao Web",
      slug: "programacao-web",
      categoriaLoja: "Tecnologia",
      qtdAulas: 60,
      cargaHoraria: "200h",
      precoOriginal: 497.0,
      precoVitrineMain: 397.0,
      destaqueHome: false,
    },
    {
      nome: "Design Grafico",
      slug: "design-grafico",
      categoriaLoja: "Criatividade",
      qtdAulas: 30,
      cargaHoraria: "80h",
      precoOriginal: 247.0,
      precoVitrineMain: 197.0,
      destaqueHome: false,
    },
    {
      nome: "Contabilidade Basica",
      slug: "contabilidade-basica",
      categoriaLoja: "Negocios",
      qtdAulas: 25,
      cargaHoraria: "60h",
      precoOriginal: 197.0,
      precoVitrineMain: 147.0,
      destaqueHome: false,
    },
    // Idiomas — 4 cursos para a seção "Idiomas" (categoria) da home.
    {
      nome: "Ingles para Iniciantes",
      slug: "ingles-para-iniciantes",
      categoriaLoja: "Idiomas",
      qtdAulas: 50,
      cargaHoraria: "120h",
      precoOriginal: 247.0,
      precoVitrineMain: 167.0,
      destaqueHome: false,
    },
    {
      nome: "Espanhol Completo",
      slug: "espanhol-completo",
      categoriaLoja: "Idiomas",
      qtdAulas: 45,
      cargaHoraria: "100h",
      precoOriginal: 247.0,
      precoVitrineMain: 167.0,
      destaqueHome: false,
    },
    {
      nome: "Frances Basico",
      slug: "frances-basico",
      categoriaLoja: "Idiomas",
      qtdAulas: 40,
      cargaHoraria: "90h",
      precoOriginal: 247.0,
      precoVitrineMain: 167.0,
      destaqueHome: false,
    },
    {
      nome: "Italiano do Zero",
      slug: "italiano-do-zero",
      categoriaLoja: "Idiomas",
      qtdAulas: 38,
      cargaHoraria: "85h",
      precoOriginal: 247.0,
      precoVitrineMain: 167.0,
      destaqueHome: false,
    },
  ]

  // findFirst + create/update em vez de upsert: o unique de nome passou a ser
  // (provider, authorTenantId, nome) e o Prisma nao aceita coluna nula num
  // unique composto. Mesmo motivo do Coupon, que ja usa este par por causa do
  // @@unique([tenantId, code]) com NULL.
  for (const c of cursos) {
    const existing = await prisma.course.findFirst({
      where: { provider: "EA", nome: c.nome, authorTenantId: null },
      select: { id: true },
    })
    if (existing) {
      await prisma.course.update({
        where: { id: existing.id },
        data: {
          precoVitrineMain: c.precoVitrineMain,
          destaqueHome: c.destaqueHome,
          ordemHome: c.ordemHome ?? null,
        },
      })
    } else {
      await prisma.course.create({ data: { ...c, updatedAt: new Date() } })
    }
  }

  // Seção "Idiomas" da home (PMB) — seção de CATEGORIA como qualquer outra
  // (migration 20260910_idiomas_section_to_category; antes era a lista fixa
  // kind="idiomas"). Em prod a categoria e os vínculos vêm do catálogo; aqui
  // garantimos os dois para o banco local, onde o backfill de categorias rodou
  // com a tabela de cursos ainda vazia.
  const idiomasCategory = await prisma.category.upsert({
    where: { slug: "idiomas" },
    update: {},
    create: { name: "Idiomas", slug: "idiomas" },
  })
  const idiomaCourses = await prisma.course.findMany({
    where: { categoriaLoja: "Idiomas", authorTenantId: null },
    select: { id: true },
  })
  await prisma.courseCategory.createMany({
    data: idiomaCourses.map((c) => ({
      courseId: c.id,
      categoryId: idiomasCategory.id,
    })),
    skipDuplicates: true,
  })

  const idiomasConfig = {
    kind: "category_courses",
    title: "Idiomas",
    subtitle: "Aprenda um novo idioma e abra portas no mercado de trabalho",
    categoryId: idiomasCategory.id,
    mode: "random",
    count: 8,
    courseIds: [],
    showSeeMore: true,
  }

  const [existingIdiomas, existingEja] = await Promise.all([
    // `pmb-idiomas` pode ainda ser a linha fixa antiga (a migration só converte
    // quando a categoria já existia) — o update abaixo a converte.
    prisma.homeSection.findFirst({
      where: { tenantId: null, OR: [{ id: "pmb-idiomas" }, { kind: "idiomas" }] },
      select: { id: true },
    }),
    prisma.homeSection.findFirst({
      where: { tenantId: null, kind: "eja" },
      select: { id: true },
    }),
  ])

  // Quando a linha já existe, só atualiza o conteúdo de Idiomas (a posição já
  // está correta). EJA fica como está (desativada até a PMB configurar).
  if (existingIdiomas) {
    await prisma.homeSection.update({
      where: { id: existingIdiomas.id },
      data: { kind: "category_courses", config: idiomasConfig },
    })
  }

  // Fallback local (migration não rodou): cria as linhas faltantes na ordem
  // pedida — ... Administrativo → EJA → Idiomas → "Sua escola no bolso".
  if (!existingIdiomas || !existingEja) {
    const [admin, learn, last] = await Promise.all([
      prisma.homeSection.findFirst({
        where: { id: "pmb-cat-administrativo", tenantId: null },
        select: { position: true },
      }),
      prisma.homeSection.findFirst({
        where: { id: "pmb-learn-anywhere", tenantId: null },
        select: { position: true },
      }),
      prisma.homeSection.findFirst({
        where: { tenantId: null },
        orderBy: { position: "desc" },
        select: { position: true },
      }),
    ])
    const anchor =
      admin?.position ?? (learn ? learn.position - 1 : (last?.position ?? -1))
    const toCreate = (existingEja ? 0 : 1) + (existingIdiomas ? 0 : 1)
    // Abre espaço logo após a âncora.
    await prisma.homeSection.updateMany({
      where: { tenantId: null, position: { gt: anchor } },
      data: { position: { increment: toCreate } },
    })
    let pos = anchor + 1
    if (!existingEja) {
      await prisma.homeSection.create({
        data: {
          id: "pmb-eja",
          tenantId: null,
          kind: "eja",
          position: pos++,
          enabled: false,
          config: { kind: "eja" },
          updatedAt: new Date(),
        },
      })
    }
    if (!existingIdiomas) {
      await prisma.homeSection.create({
        data: {
          id: "pmb-idiomas",
          tenantId: null,
          kind: "category_courses",
          position: pos++,
          enabled: true,
          config: idiomasConfig,
          updatedAt: new Date(),
        },
      })
    }
  }

  // Normaliza a ordem das seções do PMB para a ordem canônica (espelha a
  // migration 20260620_eja_idiomas_reposition). Em prod a migration faz isso;
  // aqui garante que um banco local recém-semeado já nasça na ordem pedida:
  //   Benefícios → Mais vendidos → Informática → Qual profissão →
  //   Administrativo → EJA → Idiomas → Sua escola no bolso → Diversas →
  //   Sua nova profissão → Técnica → Depoimentos.
  await reorderPmbHomeCanonical()

  // Cupons — 1 SUPER_ADMIN (50%), 1 PMB_SALES (30%), 1 consultor (10%)
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const existingSuper = await prisma.coupon.findFirst({
    where: { tenantId: null, code: "SUPER50" },
  })
  if (!existingSuper) {
    await prisma.coupon.create({
      data: {
        tenantId: null,
        code: "SUPER50",
        discountType: DiscountType.PERCENTAGE,
        discountValue: 50,
        validFrom: now,
        validUntil: in30,
        isActive: true,
        createdByUserId: superAdmin.id,
        createdByRole: UserRole.SUPER_ADMIN,
        updatedAt: new Date(),
      },
    })
  }

  const existingSales = await prisma.coupon.findFirst({
    where: { tenantId: null, code: "VENDAS30" },
  })
  if (!existingSales) {
    await prisma.coupon.create({
      data: {
        tenantId: null,
        code: "VENDAS30",
        discountType: DiscountType.PERCENTAGE,
        discountValue: 30,
        validFrom: now,
        validUntil: in30,
        isActive: true,
        createdByUserId: sales.id,
        createdByRole: UserRole.PMB_SALES,
        updatedAt: new Date(),
      },
    })
  }

  const existingConsult = await prisma.coupon.findFirst({
    where: { tenantId: tenant1.id, code: "CONSULT10" },
  })
  if (!existingConsult) {
    await prisma.coupon.create({
      data: {
        tenantId: tenant1.id,
        code: "CONSULT10",
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: now,
        validUntil: in30,
        isActive: true,
        createdByUserId: consultor.id,
        createdByRole: UserRole.RESELLER,
        updatedAt: new Date(),
      },
    })
  }

  // Chamados de demonstração (atendimento) — 9 registros cobrindo situações
  // comuns do dia a dia, para treinamento e apresentação comercial. Idempotente
  // via marcador no campo `source` ("seed:demo:*").
  const existingDemoTickets = await prisma.contactMessage.findFirst({
    where: { source: { startsWith: "seed:demo" } },
    select: { id: true },
  })
  if (!existingDemoTickets) {
    const day = 24 * 60 * 60 * 1000
    const demoTickets = [
      // --- PMB institucional (tenantId=null) ---
      {
        tenantId: null,
        kind: "CONTACT" as const,
        status: "OPEN" as const,
        nome: "Mariana Alves",
        email: "mariana.alves@gmail.com",
        telefone: "+5511988887777",
        assunto: "Dúvida sobre como me tornar uma unidade parceira",
        mensagem:
          "Olá! Tenho interesse em abrir uma unidade do Profissionaliza Mais Brasil na minha cidade. Como funciona o licenciamento e quais os valores?",
        source: "seed:demo:/contato",
        createdAt: new Date(now.getTime() - 1 * day),
      },
      {
        tenantId: null,
        kind: "CONTACT" as const,
        status: "RESOLVED" as const,
        nome: "Carlos Eduardo Lima",
        email: "carlos.lima@hotmail.com",
        telefone: "+5521977776666",
        assunto: "Os certificados são reconhecidos?",
        mensagem:
          "Gostaria de saber se os certificados dos cursos têm validade nacional e se posso usar para comprovar horas complementares na faculdade.",
        source: "seed:demo:/contato",
        resolvedAt: new Date(now.getTime() - 2 * day),
        resolvedByUserId: sales.id,
        createdAt: new Date(now.getTime() - 4 * day),
      },
      {
        tenantId: null,
        kind: "STUDENT_SUPPORT" as const,
        status: "OPEN" as const,
        nome: "Patrícia Gomes",
        email: "patricia.gomes@gmail.com",
        telefone: "+5531966665555",
        assunto: "Não consigo acessar a área do aluno",
        mensagem:
          "Comprei o curso de Excel Avançado ontem, recebi o e-mail de confirmação, mas quando tento entrar na plataforma diz que minha senha está incorreta. Podem ajudar?",
        source: "seed:demo:aluno",
        createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      },
      {
        tenantId: null,
        kind: "STUDENT_SUPPORT" as const,
        status: "RESOLVED" as const,
        nome: "Rafael Souza",
        email: "rafael.souza@outlook.com",
        telefone: "+5511955554444",
        assunto: "Emissão do certificado após conclusão",
        mensagem:
          "Terminei todas as aulas do curso de Marketing Digital e gostaria de saber como faço para emitir o meu certificado.",
        source: "seed:demo:aluno",
        resolvedAt: new Date(now.getTime() - 1 * day),
        resolvedByUserId: superAdmin.id,
        createdAt: new Date(now.getTime() - 3 * day),
      },
      // --- Unidade revenda1 (tenant1) ---
      {
        tenantId: tenant1.id,
        kind: "CONTACT" as const,
        status: "OPEN" as const,
        nome: "Juliana Pereira",
        email: "juliana.pereira@gmail.com",
        telefone: "+5541944443333",
        assunto: "Formas de pagamento disponíveis",
        mensagem:
          "Vi o curso de Design Gráfico na vitrine de vocês. Posso pagar no boleto parcelado? Em quantas vezes?",
        source: "seed:demo:loja:revenda1",
        createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      },
      {
        tenantId: tenant1.id,
        kind: "STUDENT_SUPPORT" as const,
        status: "OPEN" as const,
        nome: "Bruno Carvalho",
        email: "bruno.carvalho@gmail.com",
        telefone: "+5551933332222",
        assunto: "Vídeo aula não carrega",
        mensagem:
          "Estou tentando assistir a aula 12 do curso de Programação Web, mas o vídeo fica carregando e não inicia. Já tentei em outro navegador.",
        source: "seed:demo:aluno",
        createdAt: new Date(now.getTime() - 2 * day),
      },
      {
        tenantId: tenant1.id,
        kind: "STUDENT_SUPPORT" as const,
        status: "RESOLVED" as const,
        nome: "Fernanda Dias",
        email: "fernanda.dias@gmail.com",
        telefone: "+5511922221111",
        assunto: "Atualização de dados cadastrais",
        mensagem:
          "Preciso corrigir meu nome no cadastro, pois saiu com um erro de digitação e isso vai aparecer no certificado.",
        source: "seed:demo:aluno",
        resolvedAt: new Date(now.getTime() - 2 * day),
        resolvedByUserId: owner1.id,
        createdAt: new Date(now.getTime() - 5 * day),
      },
      {
        tenantId: tenant1.id,
        kind: "CONTACT" as const,
        status: "RESOLVED" as const,
        nome: "Anderson Ribeiro",
        email: "anderson.ribeiro@gmail.com",
        telefone: "+5511911110000",
        assunto: "Validação de certificado",
        mensagem:
          "Recebi um certificado de um aluno e gostaria de confirmar se ele é autêntico. Como funciona o QR Code de validação?",
        source: "seed:demo:loja:revenda1",
        resolvedAt: new Date(now.getTime() - 1 * day),
        resolvedByUserId: owner1.id,
        createdAt: new Date(now.getTime() - 3 * day),
      },
      {
        tenantId: tenant1.id,
        kind: "STUDENT_SUPPORT" as const,
        status: "OPEN" as const,
        nome: "Luciana Martins",
        email: "luciana.martins@gmail.com",
        telefone: "+5511900009999",
        assunto: "Prazo de acesso ao curso",
        mensagem:
          "Por quanto tempo eu tenho acesso ao conteúdo do curso depois da matrícula? Tenho até quando para concluir?",
        source: "seed:demo:aluno",
        createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      },
    ]
    await prisma.contactMessage.createMany({ data: demoTickets })
    console.log(`- ${demoTickets.length} chamados de demonstração (atendimento)`)
  }

  void owner1

  console.log("Seed completo:")
  console.log("- SUPER_ADMIN: super@pmb.com.br / super123")
  console.log("- PMB_SALES: vendas@pmb.com.br / vendas123")
  console.log("- PMB_RESELLER_MGR: gerente@pmb.com.br / gerente123 (só a carteira dele)")
  console.log("- PMB_RESELLER_DIRECTOR: diretor@pmb.com.br / diretor123 (todas as unidades)")
  console.log("- PMB_DESIGNER: designer@pmb.com.br / designer123 (só /admin/artes)")
  console.log("- RESELLER owner1: revenda1@teste.com / teste123 (tenant=revenda1, gerente=gerente)")
  console.log("- RESELLER owner2: revenda2@teste.com / teste123 (tenant=revenda2, sem gerente)")
  console.log("- Consultor: consultor1@teste.com / teste123 (tenant1, maxDiscount=20%)")
  console.log("- 9 cursos (4 de Idiomas); 2 destacados na home")
  console.log("- Seções home: Idiomas (4 cursos) + EJA (banner, desativada)")
  console.log("- Cupons: SUPER50 (super_admin), VENDAS30 (pmb_sales), CONSULT10 (tenant1/consultor)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
