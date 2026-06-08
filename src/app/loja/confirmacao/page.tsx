import Link from "next/link"
import { ExternalLink, Home, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SuccessIcon } from "@/components/loja/success-icon"
import { ConfirmationCard } from "@/components/loja/confirmation-card"
import { NextSteps } from "@/components/loja/next-steps"
import { getCurrentTenant } from "@/lib/tenant/current"
import { prisma } from "@/lib/prisma"
import { resolveVitrinePixels } from "@/lib/tracking/resolve"
import { TrackingPurchaseEvent } from "@/components/shared/tracking-purchase-event"

interface ConfirmacaoPageProps {
  searchParams: Promise<{
    enrollment_id?: string
    status?: string
  }>
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

function buildOrderNumber(id: string, createdAt: Date): string {
  const year = createdAt.getFullYear()
  const month = String(createdAt.getMonth() + 1).padStart(2, "0")
  const suffix = id.slice(-6).toUpperCase()
  return `PMB-${year}-${month}-${suffix}`
}

export default async function ConfirmacaoPage({
  searchParams,
}: ConfirmacaoPageProps) {
  const tenant = await getCurrentTenant()
  const { enrollment_id } = await searchParams

  if (!tenant || !enrollment_id) {
    return (
      <section className="bg-[#FAFAFA] py-10 md:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-[var(--color-pmb-green-900)] md:text-3xl">
            Matrícula não encontrada
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-600 md:text-base">
            Não conseguimos localizar sua matrícula. Verifique o link recebido.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <Button size="lg" className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]">
              <Home className="mr-2 h-4 w-4" />
              Voltar à loja
            </Button>
          </Link>
        </div>
      </section>
    )
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollment_id, tenantId: tenant.id },
    include: {
      student: { select: { nome: true, email: true } },
      course: { select: { nome: true } },
    },
  })

  if (!enrollment) {
    return (
      <section className="bg-[#FAFAFA] py-10 md:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-[var(--color-pmb-green-900)] md:text-3xl">
            Matrícula não encontrada
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-600 md:text-base">
            Verifique o link recebido ou entre em contato com o suporte.
          </p>
        </div>
      </section>
    )
  }

  const isApproved = enrollment.status === "ACTIVE"
  const title = isApproved
    ? "Matrícula realizada com sucesso!"
    : "Estamos processando seu pagamento"
  const subtitle = isApproved
    ? "Obrigado pela confiança. Você já pode começar a estudar agora mesmo."
    : "Assim que o pagamento for confirmado, liberaremos seu acesso e enviaremos as credenciais por email."

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      {isApproved && (
        <TrackingPurchaseEvent
          pixels={await resolveVitrinePixels(tenant.id)}
          purchase={{
            value: Number(enrollment.finalAmount),
            currency: "BRL",
            transactionId: buildOrderNumber(enrollment.id, enrollment.createdAt),
            contentName: enrollment.course.nome,
          }}
        />
      )}
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="text-center">
          <SuccessIcon />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-600 md:text-base">
            {subtitle}
          </p>
        </div>

        <div className="mt-10 space-y-6">
          <ConfirmationCard
            numeroPedido={buildOrderNumber(enrollment.id, enrollment.createdAt)}
            curso={enrollment.course.nome}
            total={formatBRL(Number(enrollment.finalAmount))}
            email={enrollment.student.email ?? "—"}
            status={enrollment.status}
          />

          <NextSteps autoRedirect={isApproved} />

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/aluno">
              <Button
                size="lg"
                className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)] sm:w-auto"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Ir para área de aulas
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <Home className="mr-2 h-4 w-4" />
                Voltar à loja
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
