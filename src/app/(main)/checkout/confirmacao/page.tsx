import Link from "next/link"
import { ExternalLink, Home, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SuccessIcon } from "@/components/loja/success-icon"
import { ConfirmationCard } from "@/components/loja/confirmation-card"
import { NextSteps } from "@/components/loja/next-steps"
import { StatusPoller } from "@/components/loja/status-poller"
import { prisma } from "@/lib/prisma"
import { resolvePmbSelfPixels } from "@/lib/tracking/resolve"
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
  const { enrollment_id } = await searchParams

  if (!enrollment_id) {
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
          <Link href="/cursos" className="mt-6 inline-block">
            <Button
              size="lg"
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-900)]"
            >
              <Home className="mr-2 h-4 w-4" />
              Ver catálogo
            </Button>
          </Link>
        </div>
      </section>
    )
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollment_id, tenantId: null },
    include: {
      student: { select: { nome: true, email: true } },
      course: { select: { nome: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { mpPaymentType: true, gateway: true },
      },
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

  const isApproved =
    enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED"
  const lastPaymentType = enrollment.payments[0]?.mpPaymentType ?? null

  // Para PENDING, customiza a mensagem por método (PIX/Boleto/Cartão).
  // Como ainda não criamos o Payment row antes da confirmação do webhook,
  // mpPaymentType pode estar vazio — usa fallback genérico.
  function pendingMessages() {
    if (lastPaymentType === "pix") {
      return {
        title: "Aguardando seu pagamento via PIX",
        subtitle:
          "Assim que o PIX for compensado (geralmente em segundos), liberamos seu acesso e enviamos as credenciais por email.",
      }
    }
    if (lastPaymentType === "ticket" || lastPaymentType === "boleto") {
      return {
        title: "Boleto gerado",
        subtitle:
          "O boleto pode levar até 3 dias úteis para ser compensado. Você receberá um email assim que sua matrícula for liberada.",
      }
    }
    if (lastPaymentType === "credit_card") {
      return {
        title: "Pagamento em análise",
        subtitle:
          "Sua operadora está validando a transação. Você receberá um email assim que for aprovada.",
      }
    }
    return {
      title: "Estamos processando seu pagamento",
      subtitle:
        "Assim que o pagamento for confirmado, liberaremos seu acesso e enviaremos as credenciais por email.",
    }
  }

  const pending = pendingMessages()
  const title = isApproved
    ? "Matrícula realizada com sucesso!"
    : pending.title
  const subtitle = isApproved
    ? "Obrigado pela confiança. Você já pode começar a estudar agora mesmo."
    : pending.subtitle

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <StatusPoller enrollmentId={enrollment.id} initialStatus={enrollment.status} />
      {isApproved && (
        <TrackingPurchaseEvent
          pixels={await resolvePmbSelfPixels()}
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
                className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-900)] sm:w-auto"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Ir para área de aulas
              </Button>
            </Link>
            <Link href="/cursos">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <Home className="mr-2 h-4 w-4" />
                Ver mais cursos
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export const dynamic = "force-dynamic"
