import { cookies } from "next/headers"
import { CourseRow } from "./course-row"
import { TecnicaSection } from "./tecnica-section"
import { EjaSection } from "./eja-section"
import { PackagesRow } from "@/components/loja/packages-row"
import { resolveVitrinePackages } from "@/lib/packages/vitrine"
import {
  CategoriesGridSection,
  InstitutionalSection,
} from "./section-renderers"
import { loadTecnicaSectionContent } from "@/lib/catalog/tecnica"
import { loadEjaSectionContent } from "@/lib/catalog/eja"
import {
  loadHomeSections,
  resolveSectionCourses,
  resolveCategoriesForSection,
  parseBestsellersCookie,
  serializeBestsellersCookie,
  BESTSELLERS_COOKIE,
  type BestsellersSnapshot,
  type HomeSectionRecord,
  type CategoriesGridConfig,
  type InstitutionalConfig,
} from "@/lib/home/sections"
import { prisma } from "@/lib/prisma"
import { getSystemSettings } from "@/lib/system-settings"
import { interestFreePhrase } from "@/lib/mercadopago/installments"
import { getSupportContacts, buildTenantSupportContacts } from "@/lib/branding"

interface DynamicHomeSectionsProps {
  tenantId: string | null
}

export async function DynamicHomeSections({
  tenantId,
}: DynamicHomeSectionsProps) {
  const [sections, interestFree, supportHoursText] = await Promise.all([
    loadHomeSections(tenantId),
    resolveInterestFree(tenantId),
    resolveSupportHours(tenantId),
  ])
  const enabled = sections.filter((s) => s.enabled)
  // Texto dinâmico do selo de parcelamento do trust-bar (substitui o token
  // {{semJuros}}) conforme o nº de parcelas sem juros da unidade (revenda) ou da
  // PMB — mesma fonte de verdade do checkout.
  const semJurosText = interestFreePhrase(interestFree)

  const cookieStore = await cookies()
  const initialSnapshot = parseBestsellersCookie(
    cookieStore.get(BESTSELLERS_COOKIE)?.value,
  )

  // Holder object: mutar `current` em callbacks evita o erro
  // `react-hooks/immutability` que vetaria reatribuir uma `let` capturada.
  const snapshotHolder: { current: BestsellersSnapshot | null } = {
    current: null,
  }

  // Pré-processa as seções EM PARALELO (PERF-002): cada renderSection faz I/O
  // independente (queries de catálogo/categorias). O fan-out serial anterior
  // (for...of await) somava as latências na home — a página de maior tráfego.
  // Promise.all preserva a ordem do array, então a ordem visual é mantida.
  const rendered = await Promise.all(
    enabled.map((section) =>
      renderSection(section, {
        tenantId,
        semJurosText,
        supportHoursText,
        bestsellersSnapshot: initialSnapshot,
        onNewBestsellersSnapshot: (snap) => {
          snapshotHolder.current = snap
        },
      }).then((node) => ({ id: section.id, node })),
    ),
  )
  const nodes = rendered.filter(
    (r): r is { id: string; node: React.ReactNode } => Boolean(r.node),
  )

  // Persiste snapshot novo (best-effort).
  if (snapshotHolder.current) {
    try {
      cookieStore.set({
        name: BESTSELLERS_COOKIE,
        value: serializeBestsellersCookie(snapshotHolder.current),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      })
    } catch {
      // pre-render estático lança — ignora.
    }
  }

  return (
    <>
      {nodes.map((n) => (
        <div key={n.id}>{n.node}</div>
      ))}
    </>
  )
}

async function renderSection(
  section: HomeSectionRecord,
  ctx: {
    tenantId: string | null
    semJurosText: string
    supportHoursText: string | null
    bestsellersSnapshot: BestsellersSnapshot | null
    onNewBestsellersSnapshot: (snap: BestsellersSnapshot) => void
  },
): Promise<React.ReactNode | null> {
  const cfg = section.config

  if (
    cfg.kind === "bestsellers" ||
    cfg.kind === "category_courses" ||
    cfg.kind === "idiomas"
  ) {
    const resolved = await resolveSectionCourses(section, ctx.tenantId, {
      bestsellersSnapshot: ctx.bestsellersSnapshot,
      onNewBestsellersSnapshot: ctx.onNewBestsellersSnapshot,
    })
    if (!resolved) return null
    let seeMoreHref: string | undefined
    if (
      cfg.kind === "category_courses" &&
      cfg.showSeeMore &&
      resolved.meta.categorySlug
    ) {
      seeMoreHref = `/cursos?categoria=${resolved.meta.categorySlug}`
    }
    return (
      <CourseRow
        titulo={cfg.title}
        subtitulo={cfg.subtitle || undefined}
        verTodosHref={seeMoreHref}
        cursos={resolved.courses}
        // Na vitrine do revendedor (tenantId) os cards apontam para o detalhe
        // da loja (`/curso/:slug`), nao para o detalhe global da PMB.
        hrefBase={ctx.tenantId ? "/curso" : "/cursos"}
      />
    )
  }

  if (cfg.kind === "packages") {
    const packages = await resolveVitrinePackages(ctx.tenantId)
    if (packages.length === 0) return null
    return (
      <PackagesRow
        titulo={cfg.title}
        subtitulo={cfg.subtitle || undefined}
        packages={packages}
        // Vitrine de revenda: detalhe em /pacote/:slug; PMB: /pacotes/:slug.
        hrefBase={ctx.tenantId ? "/pacote" : "/pacotes"}
      />
    )
  }

  if (cfg.kind === "categories_grid") {
    const categories = await resolveCategoriesForSection(
      section as HomeSectionRecord<CategoriesGridConfig>,
    )
    return <CategoriesGridSection config={cfg} categories={categories} />
  }

  if (cfg.kind === "institutional") {
    return (
      <InstitutionalSection
        config={cfg as InstitutionalConfig}
        semJurosText={ctx.semJurosText}
        supportHoursText={ctx.supportHoursText}
      />
    )
  }

  if (cfg.kind === "tecnica") {
    // Lista/imagens padronizadas pela PMB; na vitrine de revendedor o link de
    // destino e o rótulo são os da própria unidade (Tenant.tecnica*).
    const { label, url, courses } = await loadTecnicaSectionContent(ctx.tenantId)
    // TecnicaSection já retorna null quando não há cursos nem URL base.
    return <TecnicaSection label={label} courses={courses} fallbackUrl={url} />
  }

  if (cfg.kind === "eja") {
    // Banner (só imagem) padronizado pela PMB — desktop + mobile; link do escopo
    // (PMB ou unidade). EjaSection retorna null sem link ou sem imagem.
    const { label, url, bannerImageUrl, bannerImageUrlMobile } =
      await loadEjaSectionContent(ctx.tenantId)
    return (
      <EjaSection
        label={label}
        url={url}
        bannerImageUrl={bannerImageUrl}
        bannerImageUrlMobile={bannerImageUrlMobile}
      />
    )
  }

  return null
}

/**
 * Nº de parcelas sem juros vigente na superfície: da unidade (revenda) ou da PMB
 * (home institucional). Default 1 (= sem parcelamento sem juros) quando ausente.
 */
async function resolveInterestFree(tenantId: string | null): Promise<number> {
  if (!tenantId) {
    return (await getSystemSettings()).pmbInterestFreeInstallments
  }
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { interestFreeInstallments: true },
  })
  return t?.interestFreeInstallments ?? 1
}

/**
 * Horário de atendimento exibido no selo "Suporte no WhatsApp" do trust-bar
 * (substitui o token {{horarioAtendimento}}). Reusa os helpers do rodapé para
 * manter barra de benefícios e rodapé sempre coerentes:
 *  - unidade (revenda): usa `Tenant.supportHours` — `null` quando não configurado
 *    (a linha some, igual ao rodapé);
 *  - home PMB (sem tenant): fallback do próprio rodapé PMB (`getSupportContacts`).
 */
async function resolveSupportHours(
  tenantId: string | null,
): Promise<string | null> {
  if (!tenantId) return getSupportContacts().hours
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { supportHours: true },
  })
  return buildTenantSupportContacts({ supportHours: t?.supportHours ?? null })
    .hours
}
