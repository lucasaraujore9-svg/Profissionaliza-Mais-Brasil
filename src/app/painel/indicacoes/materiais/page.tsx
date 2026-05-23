import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { ensureReferralCode } from "@/lib/referrals/code"
import { vitrineDomain } from "@/lib/tenant/urls"
import { PageHeader } from "@/components/painel/page-header"
import { Card } from "@/components/ui/card"
import { CopyableText } from "@/components/painel/copyable-text"

export const dynamic = "force-dynamic"

export default async function PainelIndicacoesMateriaisPage() {
  const session = await auth()
  const user = session?.user as
    | { id?: string; role?: string; tenantId?: string | null }
    | undefined
  if (!user?.id || user.role !== "RESELLER" || !user.tenantId) {
    redirect("/login?callbackUrl=/painel/indicacoes/materiais")
  }

  const code = await ensureReferralCode(user.tenantId)
  const link = `https://www.${vitrineDomain()}/seja-revendedor?ref=${encodeURIComponent(code)}`

  const messages: { label: string; text: string }[] = [
    {
      label: "WhatsApp / mensagem direta",
      text: `Oi! Conheço a Profissionaliza Mais Brasil, que ajuda quem quer empreender em educação a montar a própria escola online de cursos profissionalizantes. Eles têm mais de 100 cursos prontos, plataforma de aulas, certificados e suporte. Sem comissão por aluno, só uma mensalidade.

Se você está pensando em ter o próprio portal de cursos, dá uma olhada aqui:
${link}`,
    },
    {
      label: "Instagram / Stories",
      text: `Conheça a oportunidade de ter sua própria escola online de cursos profissionalizantes! Mais de 100 cursos prontos + vitrine personalizada + suporte do maior grupo educacional do Brasil. Confira: ${link}`,
    },
    {
      label: "Email",
      text: `Assunto: Tenha sua própria escola online de cursos profissionalizantes

Olá,

Quero te apresentar a Profissionaliza Mais Brasil — uma plataforma que permite a qualquer pessoa empreender em educação com a própria vitrine de cursos profissionalizantes online.

Você recebe:
- Mais de 100 cursos prontos
- Sua própria vitrine com domínio personalizado
- Plataforma de aulas, certificados e gestão
- Suporte completo

Modelo: mensalidade fixa, sem comissão por aluno.

Use o link abaixo para conhecer e se cadastrar:
${link}

Estou indicando porque acredito no projeto. Qualquer dúvida, me fale.`,
    },
    {
      label: "Texto curto para bio / link tree",
      text: `Quer ter sua própria escola online de cursos profissionalizantes? Confira: ${link}`,
    },
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/painel/indicacoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>
      <PageHeader
        title="Materiais de indicação"
        description="Mensagens prontas para divulgar seu link. Personalize à vontade."
      />

      <div className="grid gap-4">
        {messages.map((m, i) => (
          <Card key={i} className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {m.label}
            </h3>
            <CopyableText text={m.text} />
          </Card>
        ))}
      </div>
    </div>
  )
}
