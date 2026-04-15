import { PrismaClient, UserRole, TenantStatus, BillingMode } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from "bcryptjs"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Super Admin (PMB owner — acesso total)
  const adminPassword = await bcrypt.hash("admin123", 10)
  await prisma.user.upsert({
    where: { email: "admin@pmb.com.br" },
    update: { role: UserRole.SUPER_ADMIN },
    create: {
      email: "admin@pmb.com.br",
      name: "Admin Master",
      passwordHash: adminPassword,
      role: UserRole.SUPER_ADMIN,
      updatedAt: new Date(),
    },
  })

  // PMB Sales (vendas diretas vitrine principal, cupom ate 50%)
  const salesPassword = await bcrypt.hash("vendas123", 10)
  await prisma.user.upsert({
    where: { email: "vendas@pmb.com.br" },
    update: { role: UserRole.PMB_SALES },
    create: {
      email: "vendas@pmb.com.br",
      name: "Vendas PMB",
      passwordHash: salesPassword,
      role: UserRole.PMB_SALES,
      updatedAt: new Date(),
    },
  })

  // PMB Reseller Manager (gerente de revendedores)
  const mgrPassword = await bcrypt.hash("gerente123", 10)
  const mgr = await prisma.user.upsert({
    where: { email: "gerente@pmb.com.br" },
    update: { role: UserRole.PMB_RESELLER_MGR },
    create: {
      email: "gerente@pmb.com.br",
      name: "Gerente Revendedores",
      passwordHash: mgrPassword,
      role: UserRole.PMB_RESELLER_MGR,
      updatedAt: new Date(),
    },
  })

  // Tenant (must be created before reseller user due to FK)
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { accountManagerId: mgr.id },
    create: {
      slug: "demo",
      name: "Vitrine Demo",
      status: TenantStatus.ACTIVE,
      billingMode: BillingMode.MANUAL,
      planValue: 99.90,
      tagline: "Sua escola profissionalizante online",
      accountManagerId: mgr.id,
      updatedAt: new Date(),
    },
  })

  // Reseller user linked to tenant
  const resellerPassword = await bcrypt.hash("teste123", 10)
  await prisma.user.upsert({
    where: { email: "revendedor@teste.com" },
    update: {},
    create: {
      email: "revendedor@teste.com",
      name: "Revendedor Demo",
      passwordHash: resellerPassword,
      role: UserRole.RESELLER,
      tenantId: tenant.id,
      updatedAt: new Date(),
    },
  })

  // 3 cursos de teste
  const cursos = [
    {
      nome: "Excel Avancado",
      slug: "excel-avancado",
      categoriaLoja: "Tecnologia",
      qtdAulas: 40,
      cargaHoraria: "120h",
      precoOriginal: 197.0,
    },
    {
      nome: "Marketing Digital",
      slug: "marketing-digital",
      categoriaLoja: "Marketing",
      qtdAulas: 35,
      cargaHoraria: "100h",
      precoOriginal: 297.0,
    },
    {
      nome: "Programacao Web",
      slug: "programacao-web",
      categoriaLoja: "Tecnologia",
      qtdAulas: 60,
      cargaHoraria: "200h",
      precoOriginal: 497.0,
    },
  ]

  for (const c of cursos) {
    await prisma.course.upsert({
      where: { nome: c.nome },
      update: {},
      create: {
        ...c,
        updatedAt: new Date(),
      },
    })
  }

  console.log("Seed completo:")
  console.log("- Super Admin: admin@pmb.com.br / admin123")
  console.log("- PMB Sales: vendas@pmb.com.br / vendas123")
  console.log("- PMB Reseller Mgr: gerente@pmb.com.br / gerente123")
  console.log("- Revendedor: revendedor@teste.com / teste123")
  console.log(`- Tenant: slug=demo, id=${tenant.id}`)
  console.log("- 3 cursos criados")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
