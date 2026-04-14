import { OrderSummary } from "@/components/loja/order-summary"
import { StudentForm } from "@/components/loja/student-form"
import { PaymentInfo } from "@/components/loja/payment-info"
import { CheckoutButton } from "@/components/loja/checkout-button"

export default function CheckoutPage() {
  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1A2E] md:text-3xl">
            Finalizar compra
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Preencha seus dados e escolha a forma de pagamento.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
          <div className="space-y-6">
            <StudentForm />
            <PaymentInfo />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <OrderSummary />
            <CheckoutButton />
          </aside>
        </div>
      </div>
    </section>
  )
}
