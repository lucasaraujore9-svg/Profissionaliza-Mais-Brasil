import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireCourseAuthoring } from "@/lib/course-authoring/module-gate"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { ensureUniqueCourseSlug } from "@/lib/catalog/sync"
import { slugify } from "@/lib/utils"
import { logAudit } from "@/lib/audit"
import { contextLogger } from "@/lib/logger"
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  MIN_SELLER_COMMISSION_PERCENT,
  validateAuthorTerms,
} from "@/lib/course-authoring/split"
import {
  AUTHORED_COURSE_LIST_SELECT,
  mapAuthoredCourse,
} from "@/lib/course-authoring/course-payload"
import { canReceiveSplit, syncTenantWallet } from "@/lib/course-authoring/wallet"
import { createLmsCourseShell, isLmsAuthoringEnabled } from "@/lib/lms/authoring"
import { syncTenantBrandingToLms } from "@/lib/lms"

export const GET = withRequestContext(
  { action: "painel.cursos_autorais.list", route: "/api/painel/cursos-autorais" },
  async () => {
    const guard = await requireCourseAuthoring("cursosAutorais.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const [rows, tenant] = await Promise.all([
      prisma.course.findMany({
        where: { authorTenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        select: AUTHORED_COURSE_LIST_SELECT,
      }),
      prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { asaasWalletId: true, asaasConnected: true },
      }),
    ])

    return NextResponse.json({
      data: {
        courses: rows.map(mapAuthoredCourse),
        // A tela precisa saber ANTES do submit por que o alcance de rede está
        // bloqueado — descobrir isso só no erro do "Publicar" é o padrão que a
        // gente já pagou caro em outras telas.
        canDistribute: canReceiveSplit({
          asaasWalletId: tenant?.asaasWalletId ?? null,
          asaasConnected: tenant?.asaasConnected ?? false,
          asaasWebhookToken: null,
        }),
        asaasConnected: tenant?.asaasConnected ?? false,
        authoringEnabled: isLmsAuthoringEnabled(),
        minSellerCommissionPercent: MIN_SELLER_COMMISSION_PERCENT,
        platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
      },
    })
  },
)

const createSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome do curso").max(160),
  descricao: z.string().trim().max(4000).nullable().optional(),
  cargaHoraria: z.string().trim().max(60).nullable().optional(),
  pricingMode: z.enum(["FIXED", "MIN_PRICE", "MIN_PRODUCER_NET"]),
  authorAmount: z.number().positive("Informe um valor maior que zero"),
  sellerCommissionPercent: z
    .number()
    .min(
      MIN_SELLER_COMMISSION_PERCENT,
      `A comissão de quem vender não pode ser menor que ${MIN_SELLER_COMMISSION_PERCENT}%`,
    )
    .max(100),
})

export const POST = withRequestContext(
  { action: "painel.cursos_autorais.create", route: "/api/painel/cursos-autorais" },
  async (request: Request) => {
    const guard = await requireCourseAuthoring("cursosAutorais.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = createSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    // A taxa da plataforma é SNAPSHOT no curso, não leitura viva: mudar a taxa
    // global amanhã não pode reescrever o acordo feito com este produtor.
    const terms = {
      pricingMode: data.pricingMode,
      authorAmount: data.authorAmount,
      sellerCommissionPercent: data.sellerCommissionPercent,
      platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
    }
    const termsCheck = validateAuthorTerms(terms)
    if (!termsCheck.ok) {
      return NextResponse.json(
        { error: termsCheck.message, code: termsCheck.error },
        { status: 400 },
      )
    }

    // Nome único DENTRO da unidade: duas unidades podem publicar "Excel Básico"
    // (o unique do banco é composto por autor), mas a mesma unidade ter dois
    // cursos homônimos só confunde a vitrine dela.
    const clash = await prisma.course.findFirst({
      where: { authorTenantId: ctx.tenantId, nome: data.nome },
      select: { id: true },
    })
    if (clash) {
      return NextResponse.json(
        { error: "Você já tem um curso com esse nome.", code: "DUPLICATE_NAME" },
        { status: 409 },
      )
    }

    // A casca no LMS é criada ANTES da linha aqui: se ela falhar, não fica um
    // curso órfão no catálogo que o produtor não consegue editar nem publicar.
    let lmsCourseId: string | null = null
    let lmsSlug: string | null = null
    if (isLmsAuthoringEnabled()) {
      try {
        // Garante que a unidade EXISTE do lado do LMS antes de criar a casca:
        // `POST /courses` de lá recusa (400) dono desconhecido, e o registro
        // (`PUT /tenants/:id`) é best-effort — roda na criação da revenda e ao
        // salvar a vitrine. Uma unidade anterior à integração, que nunca abriu
        // a tela de vitrine, não estaria registrada e ficaria sem conseguir
        // criar curso nenhum, com um 502 genérico na cara dela.
        const tenant = await prisma.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: { id: true, slug: true, name: true, logoUrl: true },
        })
        if (tenant) await syncTenantBrandingToLms(tenant)

        const shell = await createLmsCourseShell({
          ownerTenantExternalId: ctx.tenantId,
          title: data.nome,
          description: data.descricao ?? null,
          workload: data.cargaHoraria ?? null,
        })
        lmsCourseId = shell.id
        lmsSlug = shell.slug
      } catch (err) {
        contextLogger().error(
          { event: "course_authoring.lms_shell_failed", tenantId: ctx.tenantId, err },
          "falha ao criar a casca do curso no LMS",
        )
        return NextResponse.json(
          {
            error:
              "Não foi possível criar o curso na plataforma de aulas agora. Tente novamente.",
            code: "LMS_UNAVAILABLE",
          },
          { status: 502 },
        )
      }
    }

    const created = await prisma.course.create({
      data: {
        provider: "LMS",
        nome: data.nome,
        descricao: data.descricao ?? null,
        cargaHoraria: data.cargaHoraria ?? null,
        qtdAulas: 0,
        slug: await ensureUniqueCourseSlug(slugify(data.nome)),
        lmsCourseId,
        lmsSlug,
        authorTenantId: ctx.tenantId,
        authorUserId: ctx.userId,
        // Nasce RASCUNHO e fora das vitrines: só o "Publicar" (PATCH) o coloca
        // no ar, e lá o conteúdo é conferido.
        authoredStatus: "DRAFT",
        distribution: "OWN_ONLY",
        status: "INATIVO",
        hiddenMain: true,
        pricingMode: terms.pricingMode,
        authorAmount: terms.authorAmount,
        sellerCommissionPercent: terms.sellerCommissionPercent,
        platformFeePercent: terms.platformFeePercent,
      },
      select: AUTHORED_COURSE_LIST_SELECT,
    })

    // Melhor descobrir a carteira agora do que no "Publicar": assim a tela já
    // mostra o que falta enquanto o produtor monta o conteúdo.
    if (!(await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { asaasWalletId: true },
    }))?.asaasWalletId) {
      await syncTenantWallet(ctx.tenantId).catch(() => undefined)
    }

    await logAudit({
      action: "authored_course.create",
      resource: "Course",
      resourceId: created.id,
      actorUserId: ctx.userId,
      actorRole: "RESELLER",
      tenantId: ctx.tenantId,
      payloadAfter: {
        nome: data.nome,
        pricingMode: terms.pricingMode,
        authorAmount: terms.authorAmount,
        sellerCommissionPercent: terms.sellerCommissionPercent,
      },
    })

    return NextResponse.json({ data: mapAuthoredCourse(created) })
  },
)
