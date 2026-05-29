import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import { ContactForm } from "@/components/main/contact-form"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Contato",
  description: "Fale com a nossa equipe. Resposta em até 1 dia útil.",
}

export default async function LojaContatoPage() {
  const tenant = await getCurrentTenant()
  if (!tenant) notFound()

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <header className="mb-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-gold-600)]">
          Contato
        </p>
        <h1 className="mt-2 text-3xl font-black text-[var(--color-pmb-green)] md:text-4xl">
          Fala com a {tenant.name}
        </h1>
        <p className="mt-3 text-[15px] text-[rgba(2,89,24,0.75)]">
          Tem dúvida sobre algum curso ou precisa de ajuda? Envie sua mensagem
          que retornamos em até 1 dia útil.
        </p>
      </header>

      {/* tenantId roteia a mensagem para a caixa de atendimento desta unidade */}
      <ContactForm tenantId={tenant.id} />
    </section>
  )
}
