"use client"

import { useState } from "react"
import { AlertCircle } from "lucide-react"
import {
  CHECKOUT_STEPS,
  CheckoutProgress,
} from "./checkout-progress"
import { CheckoutFormPessoal } from "./checkout-form-pessoal"
import { CheckoutFormEmpresa } from "./checkout-form-empresa"
import { CheckoutPaymentPreview } from "./checkout-payment-preview"
import { CheckoutConfirmacao } from "./checkout-confirmacao"
import { CheckoutStepNavigation } from "./checkout-step-navigation"
import {
  pessoalSchema,
  empresaSchema,
  pagamentoSchema,
  cadastroRevendedorSchema,
} from "@/lib/schemas/revendedor-cadastro"

type BillingType = "CREDIT_CARD" | "PIX" | "BOLETO"

export interface PessoalForm {
  nome: string
  email: string
  telefone: string
  cpf: string
  password: string
}

export interface EmpresaForm {
  razaoSocial: string
  fantasia: string
  cnpj: string
  cidade: string
}

export interface PagamentoForm {
  billingType: BillingType
}

interface SubmitResult {
  slug: string
  email: string
  paymentUrl: string | null
}

export function CheckoutWizard() {
  const [currentStep, setCurrentStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)

  const [pessoal, setPessoal] = useState<PessoalForm>({
    nome: "",
    email: "",
    telefone: "",
    cpf: "",
    password: "",
  })
  const [empresa, setEmpresa] = useState<EmpresaForm>({
    razaoSocial: "",
    fantasia: "",
    cnpj: "",
    cidade: "",
  })
  const [pagamento, setPagamento] = useState<PagamentoForm>({
    billingType: "CREDIT_CARD",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validateCurrentStep(): boolean {
    setErrors({})

    if (currentStep === 1) {
      const result = pessoalSchema.safeParse(pessoal)
      const passwordOk = pessoal.password.length >= 8
      if (!result.success || !passwordOk) {
        const fieldErrors = result.success
          ? {}
          : result.error.flatten().fieldErrors
        const flat: Record<string, string> = {}
        for (const [field, list] of Object.entries(fieldErrors)) {
          if (list && list[0]) flat[field] = list[0]
        }
        if (!passwordOk) flat.password = "Senha precisa ter pelo menos 8 caracteres"
        setErrors(flat)
        return false
      }
      return true
    }

    if (currentStep === 2) {
      const result = empresaSchema.safeParse(empresa)
      if (!result.success) {
        const flat: Record<string, string> = {}
        for (const [field, list] of Object.entries(result.error.flatten().fieldErrors)) {
          if (list && list[0]) flat[field] = list[0]
        }
        setErrors(flat)
        return false
      }
      return true
    }

    if (currentStep === 3) {
      const result = pagamentoSchema.safeParse(pagamento)
      if (!result.success) {
        setErrors({ billingType: "Selecione uma forma de pagamento" })
        return false
      }
      return true
    }

    return true
  }

  async function handleFinalSubmit() {
    setSubmitError(null)
    const result = cadastroRevendedorSchema.safeParse({
      pessoal: {
        nome: pessoal.nome,
        email: pessoal.email,
        telefone: pessoal.telefone,
        cpf: pessoal.cpf,
      },
      empresa,
      pagamento,
      password: pessoal.password,
    })
    if (!result.success) {
      setSubmitError("Revise os dados informados.")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/revendedores/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      })
      const json = await response.json()
      if (!response.ok) {
        setSubmitError(json?.error ?? "Erro ao finalizar cadastro")
        setSubmitting(false)
        return
      }
      setSubmitResult(json.data)
      setCurrentStep(CHECKOUT_STEPS.length)
    } catch {
      setSubmitError("Erro de rede. Tente novamente em instantes.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleNext = async () => {
    if (currentStep === CHECKOUT_STEPS.length - 1) {
      if (!validateCurrentStep()) return
      await handleFinalSubmit()
      return
    }
    if (!validateCurrentStep()) return
    setCurrentStep((prev) => Math.min(prev + 1, CHECKOUT_STEPS.length))
  }

  const handlePrevious = () => {
    setErrors({})
    setSubmitError(null)
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-10">
      <CheckoutProgress currentStep={currentStep} />

      {submitError && (
        <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="mt-10">
        {currentStep === 1 && (
          <CheckoutFormPessoal
            value={pessoal}
            errors={errors}
            onChange={setPessoal}
          />
        )}
        {currentStep === 2 && (
          <CheckoutFormEmpresa
            value={empresa}
            errors={errors}
            onChange={setEmpresa}
          />
        )}
        {currentStep === 3 && (
          <CheckoutPaymentPreview
            value={pagamento}
            onChange={setPagamento}
          />
        )}
        {currentStep === 4 && (
          <CheckoutConfirmacao result={submitResult} email={pessoal.email} />
        )}
      </div>

      <CheckoutStepNavigation
        currentStep={currentStep}
        totalSteps={CHECKOUT_STEPS.length}
        submitting={submitting}
        onPrevious={handlePrevious}
        onNext={handleNext}
      />
    </div>
  )
}
