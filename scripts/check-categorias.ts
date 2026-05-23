import { prisma } from "@/lib/prisma"

async function main() {
  const totalAtivos = await prisma.course.count({
    where: { status: "ATIVO", hiddenMain: false },
  })

  const grouped = await prisma.course.groupBy({
    by: ["categoriaLoja"],
    where: { status: "ATIVO", hiddenMain: false },
    _count: { _all: true },
  })

  const sorted = [...grouped].sort((a, b) => b._count._all - a._count._all)

  console.log(`Total de cursos ATIVOS visíveis: ${totalAtivos}\n`)
  console.log("=== categoriaLoja (ordenada por quantidade) ===")
  for (const g of sorted) {
    const nome = g.categoriaLoja ?? "(null)"
    console.log(`  ${g._count._all.toString().padStart(4)} | ${nome}`)
  }

  const groupedInternal = await prisma.course.groupBy({
    by: ["categoriaInterna"],
    where: { status: "ATIVO" },
    _count: { _all: true },
  })
  const sortedInternal = [...groupedInternal].sort(
    (a, b) => b._count._all - a._count._all,
  )
  console.log("\n=== categoriaInterna (referência) ===")
  for (const g of sortedInternal) {
    const nome = g.categoriaInterna ?? "(null)"
    console.log(`  ${g._count._all.toString().padStart(4)} | ${nome}`)
  }

  const total = await prisma.course.count()
  console.log(`\nTotal geral (inclui INATIVOS e ocultos): ${total}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
