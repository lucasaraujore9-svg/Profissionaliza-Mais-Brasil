import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CheckoutStepNavigationProps {
  currentStep: number
  totalSteps: number
  submitting?: boolean
  onPrevious: () => void
  onNext: () => void
}

export function CheckoutStepNavigation({
  currentStep,
  totalSteps,
  submitting = false,
  onPrevious,
  onNext,
}: CheckoutStepNavigationProps) {
  const isFirst = currentStep === 1
  const isLast = currentStep === totalSteps
  const isFinalReview = currentStep === totalSteps - 1

  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:justify-between">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={isFirst || submitting}
        onClick={onPrevious}
        className="w-full sm:w-auto"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Anterior
      </Button>

      {!isLast && (
        <Button
          type="button"
          size="lg"
          onClick={onNext}
          disabled={submitting}
          className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : isFinalReview ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Finalizar cadastro
            </>
          ) : (
            <>
              Próximo
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      )}
    </div>
  )
}
