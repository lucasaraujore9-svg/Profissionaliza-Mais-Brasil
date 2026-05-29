import Image from "next/image"
import { redirect } from "next/navigation"
import { MessageCircle, AlertTriangle, LogOut } from "lucide-react"
import { auth, signOut } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function getAccountManager(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      status: true,
      accountManager: {
        select: { name: true, phone: true, email: true },
      },
    },
  })
}

function buildWhatsappUrl(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 10) return null
  const number = digits.startsWith("55") ? digits : `55${digits}`
  const msg = encodeURIComponent(
    "Olá, preciso regularizar minha conta no Profissionaliza Mais Brasil.",
  )
  return `https://wa.me/${number}?text=${msg}`
}

export default async function InadimplentePage() {
  const session = await auth()

  if (!session?.user) redirect("/login")

  const user = session.user as {
    role: string
    tenantId: string | null
    tenantStatus: string | null
  }

  if (user.role !== "RESELLER" || !user.tenantId) redirect("/painel")

  const tenant = await getAccountManager(user.tenantId)

  // Conta voltou a estar ACTIVE — redireciona para o painel
  if (tenant?.status === "ACTIVE") redirect("/painel")

  const whatsappUrl = buildWhatsappUrl(tenant?.accountManager?.phone)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image
            src="/images/logo.png"
            alt="Profissionaliza Mais Brasil"
            width={180}
            height={48}
            className="h-12 w-auto object-contain"
          />
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-7 w-7 text-amber-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Conta com pagamento pendente
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Sua unidade está suspensa por inadimplência. Regularize o pagamento
              para voltar a ter acesso completo à plataforma.
            </p>
          </div>

          {tenant?.accountManager ? (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Seu gerente de suporte
              </p>
              <p className="mt-1 font-semibold text-gray-900">
                {tenant.accountManager.name}
              </p>
              {tenant.accountManager.email && (
                <p className="text-sm text-gray-500">
                  {tenant.accountManager.email}
                </p>
              )}
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
              Entre em contato com o suporte do Profissionaliza Mais Brasil para
              regularizar sua conta.
            </div>
          )}

          <div className="space-y-3">
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" />
                Falar com meu gerente no WhatsApp
              </a>
            ) : (
              <p className="text-center text-sm text-gray-500">
                Fale com o suporte para regularizar sua conta.
              </p>
            )}

            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/login" })
              }}
            >
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Após o pagamento ser confirmado, faça login novamente para acessar o painel.
        </p>
      </div>
    </div>
  )
}
