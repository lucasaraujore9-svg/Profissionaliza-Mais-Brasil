import Link from "next/link"
import { MailCheck, ArrowLeft } from "lucide-react"

export function ConfirmationState() {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <MailCheck className="h-8 w-8 text-green-600" />
      </div>

      <h2 className="mt-5 text-2xl font-bold text-[#1A1A2E]">
        Email enviado com sucesso
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600">
        Verifique sua caixa de entrada. Enviamos um link seguro para você
        redefinir a senha. O link expira em 30 minutos.
      </p>

      <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-left text-xs text-gray-600">
        <strong className="block text-sm font-semibold text-[#1A1A2E]">
          Não recebeu?
        </strong>
        <span className="mt-1 block">
          Cheque a pasta de spam ou promoções. Se nada chegar em 5 minutos,
          reenvie abaixo.
        </span>
      </div>

      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para o login
      </Link>
    </div>
  )
}
