"use client"

import { IdCard, Mail, Phone, ShieldCheck, User, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PARENTESCOS, PARENTESCO_LABEL, type Parentesco } from "@/lib/students/guardian"

/**
 * Bloco "Responsável financeiro" — usado nos 3 checkouts públicos, nas duas
 * telas de venda direta e na edição de cadastro.
 *
 * POR QUE ELE EXISTE (vale repetir onde ele aparece): o certificado é emitido
 * com o nome do ALUNO. Antes, como o gateway exige um pagador adulto com CPF,
 * a única forma de vender para um menor era cadastrar a mãe como se fosse a
 * aluna — e o certificado saía no nome dela. Aqui os dois papéis ficam
 * separados: a cobrança usa o CPF do responsável, o certificado usa o do aluno.
 */

export interface GuardianFormState {
  responsavel: string
  responsavelCpf: string
  responsavelRg: string
  responsavelEmail: string
  responsavelFone: string
  responsavelParentesco: Parentesco | ""
  responsavelParentescoOutro: string
  responsavelDeclaracao: boolean
}

export const EMPTY_GUARDIAN: GuardianFormState = {
  responsavel: "",
  responsavelCpf: "",
  responsavelRg: "",
  responsavelEmail: "",
  responsavelFone: "",
  responsavelParentesco: "",
  responsavelParentescoOutro: "",
  responsavelDeclaracao: false,
}

/** Só envia o bloco quando há de fato um responsável — evita mandar strings vazias. */
export function guardianPayload(
  g: GuardianFormState,
  active: boolean,
): Record<string, unknown> {
  if (!active || (!g.responsavel.trim() && !g.responsavelCpf.trim())) return {}
  return {
    responsavel: g.responsavel.trim(),
    responsavelCpf: g.responsavelCpf,
    responsavelRg: g.responsavelRg.trim() || undefined,
    responsavelEmail: g.responsavelEmail.trim() || undefined,
    responsavelFone: g.responsavelFone,
    responsavelParentesco: g.responsavelParentesco || undefined,
    responsavelParentescoOutro:
      g.responsavelParentesco === "outro"
        ? g.responsavelParentescoOutro.trim() || undefined
        : undefined,
    responsavelDeclaracao: g.responsavelDeclaracao,
  }
}

interface GuardianFieldsProps {
  value: GuardianFormState
  onChange: (patch: Partial<GuardianFormState>) => void
  fieldErrors?: Record<string, string | undefined>
  disabled?: boolean
  /** `true` quando a data de nascimento indica menor — muda o texto e obriga. */
  required: boolean
  /** Mostra RG e o tom de operador. Público não vê RG. */
  variant?: "public" | "staff"
  /** A declaração só é coletada nas portas de VENDA, não na edição de cadastro. */
  showDeclaration?: boolean
  formatCpf: (v: string) => string
  formatPhone: (v: string) => string
}

export function GuardianFields({
  value,
  onChange,
  fieldErrors = {},
  disabled,
  required,
  variant = "public",
  showDeclaration = true,
  formatCpf,
  formatPhone,
}: GuardianFieldsProps) {
  const staff = variant === "staff"

  return (
    <div className="space-y-5 rounded-xl border border-amber-200 bg-amber-50/60 p-5">
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            Responsável financeiro
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            {required ? (
              staff ? (
                <>
                  Aluno com menos de 18 anos. Informe a mãe, o pai ou o
                  responsável legal — a cobrança sai no CPF dele.{" "}
                  <strong>
                    O certificado continua saindo no nome do aluno.
                  </strong>
                </>
              ) : (
                <>
                  Aluno menor de 18 anos: o pagamento precisa estar no nome de um
                  adulto —{" "}
                  <strong>mas o certificado sai no nome do aluno.</strong>
                </>
              )
            ) : (
              <>
                Quem vai pagar não é o próprio aluno. A cobrança sai no nome e no
                CPF informados aqui;{" "}
                <strong>o certificado continua no nome do aluno.</strong>
              </>
            )}
          </p>
        </div>
      </div>

      <GField
        id="responsavel"
        label="Nome completo do responsável"
        icon={User}
        value={value.responsavel}
        onChange={(v) => onChange({ responsavel: v })}
        error={fieldErrors.responsavel}
        disabled={disabled}
        required={required}
        placeholder="Como aparece no documento"
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <GField
          id="responsavelCpf"
          label="CPF do responsável"
          icon={IdCard}
          mono
          value={value.responsavelCpf}
          onChange={(v) => onChange({ responsavelCpf: formatCpf(v) })}
          error={fieldErrors.responsavelCpf}
          disabled={disabled}
          required={required}
          placeholder="000.000.000-00"
        />
        <div className="space-y-2">
          <Label htmlFor="responsavelParentesco">Parentesco</Label>
          <select
            id="responsavelParentesco"
            className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
            value={value.responsavelParentesco}
            onChange={(e) =>
              onChange({
                responsavelParentesco: e.target.value as Parentesco | "",
              })
            }
            disabled={disabled}
            required={required}
          >
            <option value="">Selecione…</option>
            {PARENTESCOS.map((p) => (
              <option key={p} value={p}>
                {PARENTESCO_LABEL[p]}
              </option>
            ))}
          </select>
          {fieldErrors.responsavelParentesco && (
            <p className="text-xs text-red-600">
              {fieldErrors.responsavelParentesco}
            </p>
          )}
        </div>
      </div>

      {value.responsavelParentesco === "outro" && (
        <GField
          id="responsavelParentescoOutro"
          label="Qual o vínculo?"
          icon={Users}
          value={value.responsavelParentescoOutro}
          onChange={(v) => onChange({ responsavelParentescoOutro: v })}
          disabled={disabled}
          required={required}
          placeholder="Ex.: madrinha, tio"
        />
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <GField
          id="responsavelEmail"
          label="E-mail do responsável"
          type="email"
          icon={Mail}
          value={value.responsavelEmail}
          onChange={(v) => onChange({ responsavelEmail: v })}
          error={fieldErrors.responsavelEmail}
          disabled={disabled}
          required={required}
          placeholder="para onde vai a cobrança"
        />
        <GField
          id="responsavelFone"
          label="Telefone do responsável"
          type="tel"
          icon={Phone}
          value={value.responsavelFone}
          onChange={(v) => onChange({ responsavelFone: formatPhone(v) })}
          error={fieldErrors.responsavelFone}
          disabled={disabled}
          required={required}
          placeholder="(11) 99999-9999"
        />
      </div>

      {staff && (
        <GField
          id="responsavelRg"
          label="RG do responsável (opcional)"
          icon={IdCard}
          value={value.responsavelRg}
          onChange={(v) => onChange({ responsavelRg: v })}
          disabled={disabled}
          placeholder="Só se a unidade registrar"
        />
      )}

      {showDeclaration && (
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-amber-900">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400"
              checked={value.responsavelDeclaracao}
              onChange={(e) =>
                onChange({ responsavelDeclaracao: e.target.checked })
              }
              disabled={disabled}
              required={required}
            />
            <span className="inline-flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              Declaro ser o responsável legal pelo aluno e assumir a contratação
              e o pagamento deste curso.
            </span>
          </label>
          {fieldErrors.responsavelDeclaracao && (
            <p className="text-xs text-red-600">
              {fieldErrors.responsavelDeclaracao}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Campo local — os checkouts têm cada um o seu `FieldText` privado, e importar
// um deles aqui criaria dependência cruzada entre formulários.
function GField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon: Icon,
  mono,
  required,
  disabled,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  icon?: React.ComponentType<{ className?: string }>
  mono?: boolean
  required?: boolean
  disabled?: boolean
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        )}
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          className={`${Icon ? "pl-9" : ""} ${mono ? "font-mono" : ""} bg-white`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
