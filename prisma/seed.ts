import { PrismaClient, UserRole, TenantStatus, BillingMode } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from "bcryptjs"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Admin user
  const adminPassword = await bcrypt.hash("admin123", 10)
  const admin = await prisma.user.upsert({
    where: { email: "admin@pmb.com.br" },
    update: {},
    create: {
      email: "admin@pmb.com.br",
      name: "Admin Master",
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      updatedAt: new Date(),
    },
  })

  // Tenant (must be created before reseller user due to FK)
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "Vitrine Demo",
      status: TenantStatus.ACTIVE,
      billingMode: BillingMode.MANUAL,
      planValue: 99.90,
      tagline: "Sua escola profissionalizante online",
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
      precoOriginal: 197.00 as unknown as import("@prisma/client/runtime/library").Decimal,
    },
    {
      nome: "Marketing Digital",
      slug: "marketing-digital",
      categoriaLoja: "Marketing",
      qtdAulas: 35,
      cargaHoraria: "100h",
      precoOriginal: 297.00 as unknown as import("@prisma/client/runtime/library").Decimal,
    },
    {
      nome: "Programacao Web",
      slug: "programacao-web",
      categoriaLoja: "Tecnologia",
      qtdAulas: 60,
      cargaHoraria: "200h",
      precoOriginal: 497.00 as unknown as import("@prisma/client/runtime/library").Decimal,
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
  console.log("- Admin: admin@pmb.com.br / admin123")
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
