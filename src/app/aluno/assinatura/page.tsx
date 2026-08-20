import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { StartCourseButton } from "@/components/aluno/start-course-button"
import { CancelSubscriptionButton } from "@/components/aluno/subscription-actions"
import {
  loadSubscriptionCatalog,
  CATALOG_PAGE_SIZE,
} from "@/lib/subscriptions/catalog"
import {
  subscriptionGrantsAccess,
  SUBSCRIPTION_GRACE_DAYS,
} from "@/lib/subscriptions/access"
import { AlertTriangle, BookOpen, CheckCircle2, Clock, ExternalLink } from "lucide-react"

export const dynamic = "force-dynamic"

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const session = await requireStudentSession()
  if (!session) redirect("/login")

  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)

  const subscription = await prisma.studentSubscription.findFirst({
    where: {
      studentId: session.studentId,
      status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] },
    },
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      priceAtPurchase: true,
      billingType: true,
      plan: { select: { name: true, description: true } },
      // Fatura do ciclo em aberto. É o que o assinante de PIX/boleto precisa
      // para regularizar dentro da carência — sem ela, "mensalidade em aberto"
      // seria um aviso sem saída.
      payments: {
        where: { paidAt: null },
        select: { id: true, invoiceUrl: true, bankSlipUrl: true, dueDate: true, amount: true },
        orderBy: { dueDate: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  })

  if (!subscription) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-[var(--color-pmb-green-900)]">
          Você ainda não tem uma assinatura
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Com uma assinatura você estuda quantos cursos quiser pagando uma
          mensalidade.
        </p>
        {/* Aluno logado NÃO volta para o checkout anônimo: lá o
            `cpfHasRegisteredLogin` o recusa com "faça login" — que é onde ele
            já está. A contratação autenticada acontece em /aluno/assinar. */}
        <Link
          href="/aluno/assinar"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--color-pmb-green)] px-5 py-3 text-sm font-semibold text-white"
        >
          Ver planos
        </Link>
      </div>
    )
  }

  const openCharge = subscription.payments[0] ?? null
  const live = subscriptionGrantsAccess(subscription)
  const search = sp.q?.trim() || undefined
  const catalog = live
    ? await loadSubscriptionCatalog(subscription.id, { page, search })
    : null

  const totalPages = catalog ? Math.ceil(catalog.total / CATALOG_PAGE_SIZE) : 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-pmb-green-900)]">
          {subscription.plan.name}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {formatMoney(Number(subscription.priceAtPurchase))} por mês
          {subscription.currentPeriodEnd && (
            <> · válido até {formatDate(subscription.currentPeriodEnd)}</>
          )}
        </p>
      </header>

      {subscription.status === "PENDING" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Aguardando o primeiro pagamento</p>
            <p className="mt-0.5 text-xs">
              Assim que o pagamento for confirmado, seus cursos ficam liberados
              aqui.
            </p>
            {openCharge?.invoiceUrl && (
              <a
                href={openCharge.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Pagar {formatMoney(Number(openCharge.amount))}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {subscription.status === "PAST_DUE" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="text-sm text-red-900">
            <p className="font-semibold">Mensalidade em aberto</p>
            <p className="mt-0.5 text-xs">
              {live
                ? `Regularize em até ${SUBSCRIPTION_GRACE_DAYS} dias após o vencimento para não perder o acesso aos cursos.`
                : "O acesso aos cursos da assinatura foi suspenso. Regularize para voltar a estudar."}
            </p>
            {openCharge?.invoiceUrl ? (
              <a
                href={openCharge.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Pagar {formatMoney(Number(openCharge.amount))}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <Link
                href="/aluno/pagamentos"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline"
              >
                Ver pagamentos
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {subscription.status !== "PENDING" && (
        <div className="mb-6">
          <CancelSubscriptionButton
            accessUntilLabel={
              subscription.currentPeriodEnd
                ? formatDate(subscription.currentPeriodEnd)
                : null
            }
          />
        </div>
      )}

      {catalog && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              <strong>{catalog.total}</strong>{" "}
              {catalog.total === 1 ? "curso disponível" : "cursos disponíveis"}
              {search ? <> para &quot;{search}&quot;</> : null}
            </p>
            {/* GET puro: a busca vira query string, então o resultado é
                compartilhável e o botão voltar do navegador funciona. */}
            <form method="GET" className="flex gap-2">
              <input
                type="search"
                name="q"
                defaultValue={search ?? ""}
                placeholder="Buscar curso…"
                aria-label="Buscar curso"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-64"
              />
              <button
                type="submit"
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"
              >
                Buscar
              </button>
            </form>
          </div>

          {catalog.total === 0 && (
            <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              {search
                ? "Nenhum curso do seu plano corresponde a essa busca."
                : "Seu plano ainda não tem cursos disponíveis. Fale com o suporte."}
            </p>
          )}

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.courses.map((c) => (
              <li
                key={c.id}
                className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="relative h-32 w-full bg-gray-100">
                  {c.capaUrl && (
                    <Image
                      src={c.capaUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="line-clamp-2 text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {c.nome}
                  </h2>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                    <BookOpen className="h-3 w-3" />
                    {c.qtdAulas} aulas
                    {c.cargaHoraria ? ` · ${c.cargaHoraria}` : ""}
                  </p>
                  <div className="mt-auto pt-3">
                    {c.enrollmentId ? (
                      <Link
                        href="/aluno/cursos"
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-[var(--color-pmb-green-900)]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Continuar
                      </Link>
                    ) : (
                      <StartCourseButton courseId={c.id} />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2">
              {page > 1 && (
                <Link
                  href={`/aluno/assinatura?page=${page - 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                >
                  Anterior
                </Link>
              )}
              <span className="text-xs text-gray-500">
                Página {page} de {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/aluno/assinatura?page=${page + 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                >
                  Próxima
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
