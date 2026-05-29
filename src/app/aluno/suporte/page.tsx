import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { SupportForm } from "@/components/aluno/support-form"
import { HelpCircle, Mail, MessageCircle, Phone } from "lucide-react"

export const dynamic = "force-dynamic"

interface ContactChannels {
  whatsapp: string | null
  email: string | null
  storeName: string
}

function normalizeWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 10) return null
  // Garante 55 (Brasil) se nao tiver DDI
  return digits.length <= 11 ? `55${digits}` : digits
}

export default async function StudentSupportPage() {
  const session = await requireStudentSession()
  if (!session) return null

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: {
      tenantId: true,
      tenant: {
        select: {
          name: true,
          slug: true,
          whatsapp: true,
        },
      },
    },
  })

  const isPmb = student?.tenant?.slug === PMB_TENANT_SLUG
  const channels: ContactChannels = isPmb || !student?.tenant
    ? {
        whatsapp: null, // PMB nao expoe WhatsApp aqui — mensagem cai no admin
        email: "suporte@profissionalizamaisbrasil.com.br",
        storeName: "Profissionaliza Mais Brasil",
      }
    : {
        whatsapp: normalizeWhatsapp(student.tenant.whatsapp),
        email: null, // revendedor recebe via notificacao in-app
        storeName: student.tenant.name,
      }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          Suporte
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Precisa de ajuda? Fale com a equipe da{" "}
          <strong>{channels.storeName}</strong> pelos canais abaixo ou envie uma
          mensagem direto pelo painel.
        </p>
      </header>

      {/* Canais rapidos */}
      <section className="grid gap-3 sm:grid-cols-2">
        {channels.whatsapp && (
          <a
            href={`https://wa.me/${channels.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 transition-all hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-sm"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                WhatsApp
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                Atendimento mais rapido. Toque para abrir a conversa.
              </p>
            </div>
          </a>
        )}
        {channels.email && (
          <a
            href={`mailto:${channels.email}`}
            className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-[var(--color-pmb-green)] hover:shadow-sm"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
              <Mail className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Email
              </p>
              <p className="mt-0.5 break-all text-xs text-gray-600">
                {channels.email}
              </p>
            </div>
          </a>
        )}
      </section>

      {/* Form de mensagem interna */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Mande sua dúvida
          </h2>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Sua mensagem chega como notificação para a equipe — você recebe a
          resposta pelo email cadastrado ou nas notificações da sua conta.
        </p>
        <div className="mt-4">
          <SupportForm />
        </div>
      </section>

      {/* FAQ leve */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Perguntas frequentes
        </h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-[var(--color-pmb-green-900)]">
              <Phone className="mr-1.5 inline h-3.5 w-3.5 text-gray-400" />
              Como acesso as aulas?
            </dt>
            <dd className="mt-1 text-gray-600">
              Vá em <strong>Meus cursos</strong> e clique em{" "}
              <em>Acessar aulas</em> no curso desejado. Você será redirecionado
              para a plataforma de estudo.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--color-pmb-green-900)]">
              Onde vejo meu histórico de pagamentos?
            </dt>
            <dd className="mt-1 text-gray-600">
              Na aba <strong>Pagamentos</strong> você encontra todas as faturas,
              cobranças em aberto e o histórico completo.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--color-pmb-green-900)]">
              Como baixar meu certificado?
            </dt>
            <dd className="mt-1 text-gray-600">
              Após concluir 100% das aulas, o certificado fica disponível na aba{" "}
              <strong>Certificados</strong>. Demora até 24h após a conclusão.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
