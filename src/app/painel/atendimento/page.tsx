import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import {
  AtendimentoInbox,
  type AtendimentoMessage,
} from "@/components/shared/atendimento-inbox"

export const dynamic = "force-dynamic"

type Status = "OPEN" | "RESOLVED"
type KindFilter = "ALL" | "CONTACT" | "STUDENT_SUPPORT"

const STATUS_TABS: { value: Status; label: string }[] = [
  { value: "OPEN", label: "Abertas" },
  { value: "RESOLVED", label: "Resolvidas" },
]
const KIND_TABS: { value: KindFilter; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "CONTACT", label: "Contato" },
  { value: "STUDENT_SUPPORT", label: "Suporte do aluno" },
]

export default async function PainelAtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>
}) {
  const session = await auth()
  if (
    !session?.user ||
    session.user.role !== "RESELLER" ||
    !session.user.tenantId
  ) {
    redirect("/login?callbackUrl=/painel/atendimento")
  }
  const tenantId = session.user.tenantId

  const sp = await searchParams
  const status: Status = sp.status === "RESOLVED" ? "RESOLVED" : "OPEN"
  const kind: KindFilter =
    sp.kind === "CONTACT" || sp.kind === "STUDENT_SUPPORT" ? sp.kind : "ALL"

  const rows = await prisma.contactMessage.findMany({
    where: {
      tenantId, // isolado: so mensagens desta unidade
      status,
      ...(kind !== "ALL" ? { kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const messages: AtendimentoMessage[] = rows.map((m) => ({
    id: m.id,
    kind: m.kind,
    status: m.status,
    nome: m.nome,
    email: m.email,
    telefone: m.telefone,
    assunto: m.assunto,
    mensagem: m.mensagem,
    studentId: m.studentId,
    source: m.source,
    createdAt: m.createdAt.toISOString(),
  }))

  function tabHref(next: { status?: Status; kind?: KindFilter }) {
    const p = new URLSearchParams()
    p.set("status", next.status ?? status)
    const k = next.kind ?? kind
    if (k !== "ALL") p.set("kind", k)
    return `/painel/atendimento?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atendimento"
        description="Mensagens de contato da sua vitrine e chamados de suporte dos seus alunos."
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref({ status: t.value })}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
              status === t.value
                ? "bg-[var(--color-pmb-green)] text-white"
                : "border border-gray-200 bg-white text-gray-600"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <span className="mx-1 self-center text-gray-300">|</span>
        {KIND_TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref({ kind: t.value })}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
              kind === t.value
                ? "bg-[var(--color-pmb-green)] text-white"
                : "border border-gray-200 bg-white text-gray-600"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <AtendimentoInbox
        messages={messages}
        apiBase="/api/painel/atendimento"
        alunoBase="/painel/alunos"
      />
    </div>
  )
}
