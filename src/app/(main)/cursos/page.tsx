import Link from "next/link"
import { Search } from "lucide-react"
import { CourseCard, type Course } from "@/components/main/home/course-card"
import { MAIS_VENDIDOS, SAUDE, CONSTRUCAO, BELEZA } from "@/components/main/home/courses-data"
import { prisma } from "@/lib/prisma"

const CATEGORIAS = [
  { nome: "Todas", slug: "" },
  { nome: "Beleza e Estética", slug: "beleza" },
  { nome: "Saúde e Bem-estar", slug: "saude" },
  { nome: "Gastronomia", slug: "gastronomia" },
  { nome: "Eletricista e Hidráulica", slug: "eletrica" },
  { nome: "Construção Civil", slug: "construcao" },
  { nome: "Pet e Veterinária", slug: "pet" },
  { nome: "Administração", slug: "administracao" },
  { nome: "Automotivo", slug: "automotivo" },
  { nome: "Moda e Costura", slug: "moda" },
  { nome: "Tecnologia", slug: "tecnologia" },
  { nome: "Manutenção", slug: "manutencao" },
  { nome: "Vendas e Negócios", slug: "vendas" },
]

const CATEGORIA_NOMES: Record<string, string> = Object.fromEntries(
  CATEGORIAS.filter((c) => c.slug).map((c) => [c.slug, c.nome]),
)

const ACCENTS: Course["accent"][] = ["gold", "green", "cyan", "lime", "terracotta"]

async function loadCourses(q?: string, categoria?: string): Promise<Course[]> {
  try {
    const where: Record<string, unknown> = { status: "ATIVO" }
    if (q) {
      where.OR = [
        { nome: { contains: q, mode: "insensitive" } },
        { descricao: { contains: q, mode: "insensitive" } },
      ]
    }
    if (categoria && CATEGORIA_NOMES[categoria]) {
      where.OR = [
        { categoriaLoja: { contains: CATEGORIA_NOMES[categoria], mode: "insensitive" } },
        { categoriaInterna: { contains: categoria, mode: "insensitive" } },
      ]
    }
    const rows = await prisma.course.findMany({
      where,
      orderBy: [{ destaqueHome: "desc" }, { nome: "asc" }],
      take: 48,
    })
    if (rows.length === 0) return fallbackCourses(categoria)
    return rows.map((c, idx): Course => {
      const preco = c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal
      return {
        slug: c.slug,
        categoria: c.categoriaLoja ?? "Curso profissionalizante",
        titulo: c.nome,
        instrutor: "Equipe PMB",
        rating: "4.9",
        alunos: "—",
        horas: c.cargaHoraria ?? `${c.qtdAulas} aulas`,
        preco: preco ? `R$ ${Number(preco).toFixed(2).replace(".", ",")}` : "Consulte",
        parcelas: "12x sem juros",
        selo: null,
        accent: ACCENTS[idx % ACCENTS.length],
      }
    })
  } catch {
    return fallbackCourses(categoria)
  }
}

function fallbackCourses(categoria?: string): Course[] {
  const all = [...MAIS_VENDIDOS, ...SAUDE, ...CONSTRUCAO, ...BELEZA]
  const seen = new Set<string>()
  const uniq = all.filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)))
  if (!categoria) return uniq
  const nome = CATEGORIA_NOMES[categoria]
  if (!nome) return uniq
  return uniq.filter((c) => c.categoria.toLowerCase().includes(nome.toLowerCase().split(" ")[0]))
}

export default async function CursosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() || ""
  const categoria = sp.categoria?.trim() || ""
  const cursos = await loadCourses(q, categoria)
  const tituloAtivo = categoria && CATEGORIA_NOMES[categoria] ? CATEGORIA_NOMES[categoria] : "Todos os cursos"

  return (
    <div className="bg-[var(--color-pmb-mist)]">
      <section className="bg-[var(--color-pmb-green)] text-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
            Catálogo completo
          </p>
          <h1 className="mt-1 text-[28px] font-black leading-tight md:text-[40px]">{tituloAtivo}</h1>
          <p className="mt-2 max-w-xl text-[14.5px] text-white/80">
            Mais de 2.400 cursos profissionalizantes com certificado. Compre uma vez, assista quando quiser.
          </p>

          <form action="/cursos" method="get" className="mt-6 flex max-w-xl items-center gap-2 rounded-xl bg-white p-2 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.3)]">
            <Search className="ml-2 h-5 w-5 text-[var(--color-pmb-green)]" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar curso por nome..."
              className="flex-1 bg-transparent text-[14px] text-[var(--color-pmb-green)] placeholder:text-[rgba(2,89,24,0.5)] focus:outline-none"
            />
            {categoria && <input type="hidden" name="categoria" value={categoria} />}
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-pmb-gold)] px-4 py-2 text-[13px] font-bold text-[var(--color-pmb-green)] transition-colors hover:brightness-105"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-wrap gap-2 px-4 py-4 md:px-6">
          {CATEGORIAS.map((cat) => {
            const isActive = (cat.slug || "") === categoria
            const href = cat.slug ? `/cursos?categoria=${cat.slug}` : "/cursos"
            return (
              <Link
                key={cat.slug || "todas"}
                href={href}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] text-white"
                    : "border-[rgba(2,89,24,0.15)] text-[var(--color-pmb-green)] hover:border-[var(--color-pmb-green)]"
                }`}
              >
                {cat.nome}
              </Link>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        {cursos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(2,89,24,0.2)] bg-white p-12 text-center">
            <p className="text-[16px] font-bold text-[var(--color-pmb-green)]">Nenhum curso encontrado</p>
            <p className="mt-1 text-[13.5px] text-[rgba(2,89,24,0.7)]">Tente outra busca ou categoria.</p>
            <Link
              href="/cursos"
              className="mt-4 inline-block rounded-lg bg-[var(--color-pmb-gold)] px-4 py-2 text-[13px] font-bold text-[var(--color-pmb-green)]"
            >
              Ver todos os cursos
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-5 text-[13px] text-[rgba(2,89,24,0.7)]">
              {cursos.length} {cursos.length === 1 ? "curso encontrado" : "cursos encontrados"}
              {q && ` para "${q}"`}
            </p>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {cursos.map((c) => (
                <li key={c.slug}>
                  <CourseCard course={c} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
