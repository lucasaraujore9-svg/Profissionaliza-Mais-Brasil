import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

/**
 * Rastreamento de navegacao do lead (modulo de automacao).
 *
 * Fluxo:
 *  1. Cada page view na vitrine grava um VisitorEvent identificado pelo cookie
 *     anonimo `pmb_vid` (visitorId). Enquanto a pessoa nao deixa contato,
 *     leadId fica null.
 *  2. No momento da captura (form na pagina do curso ou checkout) chamamos
 *     `linkVisitorToLead`, que seta StudentLead.visitorId e faz o BACKFILL de
 *     todo o historico anonimo anterior (VisitorEvent.leadId = lead.id).
 *  3. Eventos POSTERIORES ja nascem com leadId preenchido (auto-atribuicao em
 *     `recordVisitorEvent`), aparecendo na timeline do lead automaticamente.
 *
 * O cookie e host-only (sem atributo Domain), entao cada vitrine
 * ({slug}.livrecursos.com.br, dominio custom, PMB institucional) tem o seu
 * proprio visitorId — nao ha vazamento de historico entre revendas.
 */

export const VISITOR_COOKIE = "pmb_vid"
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365 // 1 ano
// Janela de dedupe para evitar duplo-disparo (StrictMode, refresh em rajada).
const DEDUP_WINDOW_MS = 5_000

export function generateVisitorId(): string {
  return randomUUID()
}

/** Le o cookie pmb_vid do header Cookie da requisicao. */
export function readVisitorId(request: Request): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=")
    if (rawName === VISITOR_COOKIE) {
      const value = rest.join("=").trim()
      return value || null
    }
  }
  return null
}

export interface CookieAttributes {
  name: string
  value: string
  maxAge: number
  path: string
  sameSite: "lax"
  httpOnly: boolean
  secure: boolean
}

/** Atributos do cookie pmb_vid para setar via NextResponse.cookies.set. */
export function visitorCookie(value: string): CookieAttributes {
  return {
    name: VISITOR_COOKIE,
    value,
    maxAge: COOKIE_MAX_AGE_S,
    path: "/",
    sameSite: "lax",
    // Lido apenas server-side (track + captura). httpOnly evita acesso por JS
    // de terceiros e reduz superficie de XSS.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  }
}

interface RecordVisitorEventArgs {
  tenantId: string | null
  visitorId: string
  path: string
  title?: string | null
  courseSlug?: string | null
  referrer?: string | null
}

/**
 * Persiste um page view. Resolve o curso (quando courseSlug presente),
 * auto-atribui a um lead ja vinculado ao visitorId e ignora duplicatas dentro
 * da janela de dedupe. Best-effort: erros sao engolidos pelo caller.
 */
export async function recordVisitorEvent(
  args: RecordVisitorEventArgs,
): Promise<{ created: boolean; leadId: string | null }> {
  const path = sanitizePath(args.path)
  if (!path) return { created: false, leadId: null }

  // Dedupe: mesmo visitante + caminho dentro da janela curta.
  const recent = await prisma.visitorEvent.findFirst({
    where: {
      visitorId: args.visitorId,
      tenantId: args.tenantId,
      path,
      createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    select: { id: true, leadId: true },
  })
  if (recent) return { created: false, leadId: recent.leadId }

  // Resolve curso (snapshot estavel para a timeline).
  let courseId: string | null = null
  let courseSnapshot: string | null = null
  if (args.courseSlug) {
    const course = await prisma.course.findUnique({
      where: { slug: args.courseSlug },
      select: { id: true, nome: true },
    })
    if (course) {
      courseId = course.id
      courseSnapshot = course.nome
    }
  }

  // Auto-atribuicao: se o visitante ja virou lead, o evento ja nasce vinculado.
  const lead = await prisma.studentLead.findFirst({
    where: { visitorId: args.visitorId, tenantId: args.tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })

  await prisma.visitorEvent.create({
    data: {
      tenantId: args.tenantId,
      visitorId: args.visitorId,
      leadId: lead?.id ?? null,
      kind: courseId ? "COURSE_VIEW" : "PAGE_VIEW",
      path,
      title: args.title?.slice(0, 300) ?? null,
      courseId,
      courseSnapshot,
      referrer: args.referrer?.slice(0, 500) ?? null,
    },
  })

  return { created: true, leadId: lead?.id ?? null }
}

interface LinkVisitorToLeadArgs {
  visitorId: string | null | undefined
  leadId: string
  tenantId: string | null
}

/**
 * Liga o cookie do visitante a um lead e HERDA todo o historico de navegacao
 * anonimo (backfill). Idempotente. Best-effort: nunca deve quebrar a captura.
 *
 * Aceita um Prisma TransactionClient opcional para participar de uma transacao
 * existente; caso contrario usa o client global.
 */
export async function linkVisitorToLead(
  args: LinkVisitorToLeadArgs,
  client: Prisma.TransactionClient = prisma,
): Promise<{ inherited: number }> {
  const visitorId = args.visitorId?.trim()
  if (!visitorId) return { inherited: 0 }

  await client.studentLead.update({
    where: { id: args.leadId },
    data: { visitorId },
  })

  const result = await client.visitorEvent.updateMany({
    where: { visitorId, tenantId: args.tenantId, leadId: null },
    data: { leadId: args.leadId },
  })

  return { inherited: result.count }
}

export interface NavigationTimelineEntry {
  id: string
  kind: "PAGE_VIEW" | "COURSE_VIEW"
  path: string
  title: string | null
  courseName: string | null
  referrer: string | null
  createdAt: string
}

/**
 * Trilha de navegacao do lead (anterior + posterior a captura), ordenada
 * cronologicamente. Limitada para nao explodir o payload do drawer.
 */
export async function getLeadNavigationTimeline(
  leadId: string,
  limit = 200,
): Promise<NavigationTimelineEntry[]> {
  const rows = await prisma.visitorEvent.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      path: true,
      title: true,
      courseSnapshot: true,
      referrer: true,
      createdAt: true,
      course: { select: { nome: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    path: r.path,
    title: r.title,
    courseName: r.courseSnapshot ?? r.course?.nome ?? null,
    referrer: r.referrer,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Normaliza o caminho: remove query/hash e limita tamanho (LGPD). */
function sanitizePath(raw: string): string | null {
  if (!raw) return null
  let path = raw.trim()
  const queryIdx = path.search(/[?#]/)
  if (queryIdx >= 0) path = path.slice(0, queryIdx)
  if (!path.startsWith("/")) path = `/${path}`
  return path.slice(0, 500)
}
