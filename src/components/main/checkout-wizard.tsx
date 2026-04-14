"use client"

import { useState } from "react"
import {
  CHECKOUT_STEPS,
  CheckoutProgress,
} from "./checkout-progress"
import { CheckoutFormPessoal } from "./checkout-form-pessoal"
import { CheckoutFormEmpresa } from "./checkout-form-empresa"
import { CheckoutPaymentPreview } from "./checkout-payment-preview"
import { CheckoutConfirmacao } from "./checkout-confirmacao"
import { CheckoutStepNavigation } from "./checkout-step-navigation"

export function CheckoutWizard() {
  const [currentStep, setCurrentStep] = useState(1)

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, CHECKOUT_STEPS.length))
  }

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-10">
      <CheckoutProgress currentStep={currentStep} />

      <div className="mt-10">
        {currentStep === 1 && <CheckoutFormPessoal />}
        {currentStep === 2 && <CheckoutFormEmpresa />}
        {currentStep === 3 && <CheckoutPaymentPreview />}
        {currentStep === 4 && <CheckoutConfirmacao />}
      </div>

      <CheckoutStepNavigation
        currentStep={currentStep}
        totalSteps={CHECKOUT_STEPS.length}
        onPrevious={handlePrevious}
        onNext={handleNext}
      />
    </div>
  )
}
