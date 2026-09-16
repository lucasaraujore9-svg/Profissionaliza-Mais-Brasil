"use client"

/**
 * Endereço para o BOLETO do Mercado Pago, que recusa o boleto sem o endereço
 * completo do pagador. Usado nos dois formulários de assinatura (contratação e
 * pagamento de um link).
 */

export interface BoletoAddressValue {
  cep: string
  rua: string
  numero: string
  bairro: string
  cidade: string
  estado: string
}

export const EMPTY_BOLETO_ADDRESS: BoletoAddressValue = {
  cep: "",
  rua: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
}

export function BoletoAddressFields({
  value,
  onChange,
  fieldClassName,
}: {
  value: BoletoAddressValue
  onChange: (next: BoletoAddressValue) => void
  fieldClassName: string
}) {
  function set(k: keyof BoletoAddressValue, v: string) {
    onChange({ ...value, [k]: v })
  }
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <p className="text-xs text-gray-600 sm:col-span-2">
        Endereço de quem vai pagar — o banco exige no boleto.
      </p>
      <label className="text-sm">
        CEP
        <input required inputMode="numeric" autoComplete="postal-code" value={value.cep} onChange={(e) => set("cep", e.target.value)} className={fieldClassName} />
      </label>
      <label className="text-sm">
        Rua
        <input required autoComplete="address-line1" value={value.rua} onChange={(e) => set("rua", e.target.value)} className={fieldClassName} />
      </label>
      <label className="text-sm">
        Número
        <input required value={value.numero} onChange={(e) => set("numero", e.target.value)} className={fieldClassName} />
      </label>
      <label className="text-sm">
        Bairro
        <input required value={value.bairro} onChange={(e) => set("bairro", e.target.value)} className={fieldClassName} />
      </label>
      <label className="text-sm">
        Cidade
        <input required autoComplete="address-level2" value={value.cidade} onChange={(e) => set("cidade", e.target.value)} className={fieldClassName} />
      </label>
      <label className="text-sm">
        UF
        <input required maxLength={2} autoComplete="address-level1" value={value.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} className={fieldClassName} />
      </label>
    </div>
  )
}
