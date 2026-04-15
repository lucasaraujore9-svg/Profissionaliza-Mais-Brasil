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
  ]

  for (const c of cursos) {
    await prisma.course.upsert({
      where: { nome: c.nome },
      update: {
        precoVitrineMain: c.precoVitrineMain,
        destaqueHome: c.destaqueHome,
        ordemHome: c.ordemHome ?? null,
      },
      create: { ...c, updatedAt: new Date() },
    })
  }

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

  void owner1

  console.log("Seed completo:")
  console.log("- SUPER_ADMIN: super@pmb.com.br / super123")
  console.log("- PMB_SALES: vendas@pmb.com.br / vendas123")
  console.log("- PMB_RESELLER_MGR: gerente@pmb.com.br / gerente123")
  console.log("- RESELLER owner1: revenda1@teste.com / teste123 (tenant=revenda1, gerente=gerente)")
  console.log("- RESELLER owner2: revenda2@teste.com / teste123 (tenant=revenda2, sem gerente)")
  console.log("- Consultor: consultor1@teste.com / teste123 (tenant1, maxDiscount=20%)")
  console.log("- 5 cursos; 2 destacados na home")
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
