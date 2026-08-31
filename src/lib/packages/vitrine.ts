import { prisma } from "@/lib/prisma"

/**
 * Resolução de pacotes de cursos para a vitrine (PMB e revendas) e para o
 * checkout. Regras (ver memória do projeto e ADR de pacotes):
 *
 *  - Pacotes da PMB (tenantId=null) são distribuídos AUTOMATICAMENTE a todas as
 *    vitrines de revenda. A revenda pode definir o próprio preço, ocultar
 *    ("excluir da minha vitrine") e destacar via TenantPackage.
 *  - Pacotes próprios da revenda (tenantId=tenant) usam o preço/configuração do
 *    próprio CoursePackage.
 *  - O preço efetivo na vitrine da revenda = TenantPackage.price ?? package.price.
 *  - Só pacotes com >=1 curso ATIVO são vendáveis.
 */

export interface VitrinePackageCard {
  id: string
  slug: string
  name: string
  price: number
  coverImageUrl: string | null
  courseCount: number
  /** true = pacote próprio da unidade; false = pacote PMB distribuído. */
  isOwn: boolean
  featured: boolean
}

export interface VitrinePackageCourse {
  id: string
  nome: string
  slug: string
  coverImageUrl: string | null
  cargaHoraria: string | null
  qtdAulas: number
}

export interface VitrinePackageDetail extends VitrinePackageCard {
  description: string | null
  courses: VitrinePackageCourse[]
}

type PackageWithItems = {
  id: string
  slug: string
  name: string
  description: string | null
  coverImageUrl: string | null
  price: unknown
  featured: boolean
  position: number
  tenantId: string | null
  items: {
    order: number
    course: {
      id: string
      nome: string
      slug: string
      status: string
      capaImageUrl: string | null
      capaOverride: string | null
      cargaHoraria: string | null
      qtdAulas: number
    }
  }[]
}

const packageInclude = {
  items: {
    orderBy: { order: "asc" as const },
    include: {
      course: {
        select: {
          id: true,
          nome: true,
          slug: true,
          status: true,
          capaImageUrl: true,
          capaOverride: true,
          cargaHoraria: true,
          qtdAulas: true,
        },
      },
    },
  },
}

function activeCourses(pkg: PackageWithItems): PackageWithItems["items"][number]["course"][] {
  return pkg.items
    .filter((i) => i.course.status === "ATIVO")
    .map((i) => i.course)
}

function toCard(
  pkg: PackageWithItems,
  override: { price: unknown | null; customCoverUrl: string | null; isFeatured: boolean } | null,
): VitrinePackageCard | null {
  const courses = activeCourses(pkg)
  if (courses.length === 0) return null
  const price = override?.price != null ? Number(override.price) : Number(pkg.price)
  if (!(price > 0)) return null
  return {
    id: pkg.id,
    slug: pkg.slug,
    name: pkg.name,
    price,
    coverImageUrl: override?.customCoverUrl ?? pkg.coverImageUrl,
    courseCount: courses.length,
    isOwn: pkg.tenantId !== null,
    featured: override?.isFeatured || pkg.featured,
  }
}

/**
 * Lista os pacotes exibíveis na vitrine de um escopo. tenantId=null => vitrine
 * PMB (só pacotes PMB). tenantId setado => pacotes PMB (descontando ocultos pela
 * unidade) + pacotes próprios da unidade.
 */
export async function resolveVitrinePackages(
  tenantId: string | null,
): Promise<VitrinePackageCard[]> {
  if (!tenantId) {
    const pmb = (await prisma.coursePackage.findMany({
      where: { tenantId: null, enabled: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: packageInclude,
    })) as unknown as PackageWithItems[]
    return pmb
      .map((p) => toCard(p, null))
      .filter((c): c is VitrinePackageCard => c !== null)
  }

  const [pmb, own, overrides] = await Promise.all([
    prisma.coursePackage.findMany({
      where: { tenantId: null, enabled: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: packageInclude,
    }) as unknown as Promise<PackageWithItems[]>,
    prisma.coursePackage.findMany({
      where: { tenantId, enabled: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: packageInclude,
    }) as unknown as Promise<PackageWithItems[]>,
    prisma.tenantPackage.findMany({ where: { tenantId } }),
  ])

  const overrideByPkg = new Map(overrides.map((o) => [o.packageId, o]))

  const pmbCards = pmb
    .filter((p) => overrideByPkg.get(p.id)?.isVisible !== false)
    .map((p) => {
      const o = overrideByPkg.get(p.id)
      return toCard(
        p,
        o ? { price: o.price, customCoverUrl: o.customCoverUrl, isFeatured: o.isFeatured } : null,
      )
    })
    .filter((c): c is VitrinePackageCard => c !== null)

  const ownCards = own
    .map((p) => toCard(p, null))
    .filter((c): c is VitrinePackageCard => c !== null)

  return [...ownCards, ...pmbCards].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    return a.name.localeCompare(b.name, "pt-BR")
  })
}

function toDetail(
  pkg: PackageWithItems,
  override: { price: unknown | null; customCoverUrl: string | null; isFeatured: boolean } | null,
): VitrinePackageDetail | null {
  const card = toCard(pkg, override)
  if (!card) return null
  const courses: VitrinePackageCourse[] = activeCourses(pkg).map((c) => ({
    id: c.id,
    nome: c.nome,
    slug: c.slug,
    coverImageUrl: c.capaOverride ?? c.capaImageUrl,
    cargaHoraria: c.cargaHoraria,
    qtdAulas: c.qtdAulas,
  }))
  return { ...card, description: pkg.description, courses }
}

/**
 * Resolve um pacote pelo slug no escopo de um tenant (ou PMB). Prefere o pacote
 * próprio da unidade; senão um pacote PMB visível para ela.
 */
export async function getVitrinePackageBySlug(
  tenantId: string | null,
  slug: string,
): Promise<VitrinePackageDetail | null> {
  if (!tenantId) {
    const pmb = (await prisma.coursePackage.findFirst({
      where: { tenantId: null, slug, enabled: true },
      include: packageInclude,
    })) as unknown as PackageWithItems | null
    return pmb ? toDetail(pmb, null) : null
  }

  const own = (await prisma.coursePackage.findFirst({
    where: { tenantId, slug, enabled: true },
    include: packageInclude,
  })) as unknown as PackageWithItems | null
  if (own) return toDetail(own, null)

  const pmb = (await prisma.coursePackage.findFirst({
    where: { tenantId: null, slug, enabled: true },
    include: packageInclude,
  })) as unknown as PackageWithItems | null
  if (!pmb) return null

  const override = await prisma.tenantPackage.findUnique({
    where: { tenantId_packageId: { tenantId, packageId: pmb.id } },
  })
  if (override?.isVisible === false) return null
  return toDetail(
    pmb,
    override
      ? { price: override.price, customCoverUrl: override.customCoverUrl, isFeatured: override.isFeatured }
      : null,
  )
}

export interface PackageCheckoutData {
  id: string
  name: string
  slug: string
  price: number
  /** Cursos ATIVOS do pacote, em ordem. O primeiro vira a matrícula primária. */
  courses: { id: string; nome: string; plataformaCourseId: string | null }[]
}

/**
 * Resolve um pacote pelo ID para o checkout, já com o preço efetivo no escopo
 * (override da unidade quando aplicável) e a lista de cursos ativos. Aplica as
 * mesmas regras de visibilidade da vitrine (pacote oculto/sem cursos => null).
 */
export async function getPackageForCheckout(
  tenantId: string | null,
  packageId: string,
): Promise<PackageCheckoutData | null> {
  const pkg = (await prisma.coursePackage.findUnique({
    where: { id: packageId },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: {
          course: {
            select: {
              id: true,
              nome: true,
              status: true,
              provider: true,
              plataformaCourseId: true,
              lmsCourseId: true,
            },
          },
        },
      },
    },
  })) as
    | {
        id: string
        name: string
        slug: string
        price: unknown
        enabled: boolean
        tenantId: string | null
        items: {
          course: {
            id: string
            nome: string
            status: string
            provider: "EA" | "LMS"
            plataformaCourseId: string | null
            lmsCourseId: string | null
          }
        }[]
      }
    | null

  if (!pkg || !pkg.enabled) return null

  // Escopo: PMB (tenantId=null) só vende pacotes PMB; revenda vende pacotes PMB
  // (não ocultos) + os próprios.
  let price = Number(pkg.price)
  if (pkg.tenantId === null) {
    if (tenantId) {
      const override = await prisma.tenantPackage.findUnique({
        where: { tenantId_packageId: { tenantId, packageId: pkg.id } },
      })
      if (override?.isVisible === false) return null
      if (override?.price != null) price = Number(override.price)
    }
  } else if (pkg.tenantId !== tenantId) {
    // Pacote próprio de OUTRA unidade — nunca vendável aqui.
    return null
  }

  const ativos = pkg.items.filter((i) => i.course.status === "ATIVO")

  // Curso sem identificador da fornecedora nao e matriculavel (ver
  // COURSE_PROVISIONABLE). Aqui a saida e recusar o PACOTE INTEIRO, nao remover
  // o curso da lista: quem compra "5 cursos" e recebe 4 pagou por algo que nao
  // foi entregue, e o silencio esconderia justamente o defeito.
  const semFornecedora = ativos.find((i) =>
    i.course.provider === "LMS" ? !i.course.lmsCourseId : !i.course.plataformaCourseId,
  )
  if (semFornecedora) return null

  const courses = ativos.map((i) => ({
    id: i.course.id,
    nome: i.course.nome,
    plataformaCourseId: i.course.plataformaCourseId,
  }))

  if (courses.length === 0 || !(price > 0)) return null

  return { id: pkg.id, name: pkg.name, slug: pkg.slug, price, courses }
}
