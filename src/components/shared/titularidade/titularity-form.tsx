"use client"

import { useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { GuardianFields } from "@/components/shared/guardian/guardian-fields"
import { useGuardian } from "@/components/shared/guardian/use-guardian"
import { applyServerFieldErrors } from "@/lib/checkout/field-errors"
import type { TitularityCandidate } from "@/lib/students/titularity/types"

/**
 * Correção de titularidade em TRÊS PASSOS, não um formulário — isto reescreve um
 * documento oficial e não pode parecer "salvar".
 *
 * O detalhe que faz a fila andar: o bloco do responsável já vem PRÉ-PREENCHIDO
 * com o nome e o CPF que estão hoje no cadastro (quase sempre os da mãe). O
 * revisor só digita o nome da criança.
 */
export function TitularityForm({
  candidate,
  endpoint,
  onDone,
}: {
  candidate: TitularityCandidate
  endpoint: string
  onDone: () => void
}) {
  const [nomeAluno, setNomeAluno] = useState("")
  const [cpfAluno, setCpfAluno] = useState("")
  const [justificativa, setJustificativa] = useState("")
  const [confirmado, setConfirmado] = useState(false)
  const [corrigirCertificados, setCorrigirCertificados] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const guardianCtl = useGuardian({
    nascimento: candidate.nascimento ?? "",
    guardian: {
      // Pré-preenchido com o que está HOJE na ficha — é isso que transforma a
      // revisão num campo digitado em vez de um formulário inteiro.
      responsavel: candidate.responsavel ?? candidate.nome,
      responsavelCpf: candidate.cpf ?? "",
    },
  })

  async function submit() {
    setSaving(true)
    setErro(null)
    setFieldErrors({})
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeAluno.trim(),
          cpf: cpfAluno.trim() || undefined,
          nascimento: guardianCtl.nascimento,
          ...guardianCtl.payload(),
          corrigirCertificados,
          justificativa: justificativa.trim(),
          confirmado,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFieldErrors(
          applyServerFieldErrors(body.fields ?? {}, () => true) as Record<
            string,
            string
          >,
        )
        setErro(body.error ?? "Falha ao corrigir")
        return
      }
      onDone()
    } catch {
      setErro("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  // Reescrever um certificado sem CPF produziria um documento incompleto: o CPF
  // é impresso nele e conferido na validação pública.
  const exigeCpf = corrigirCertificados && candidate.certificatesCount > 0

  const pronto =
    nomeAluno.trim().length >= 3 &&
    (!exigeCpf || cpfAluno.replace(/\D/g, "").length === 11) &&
    justificativa.trim().length >= 10 &&
    confirmado &&
    (!guardianCtl.open || guardianCtl.guardian.responsavel.trim().length >= 3)

  return (
    <div className="space-y-5 text-sm">
      {/* 1 — o que está no cadastro hoje */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          1. O que está no cadastro hoje
        </h4>
        <dl className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
          <div className="flex justify-between gap-4 py-0.5">
            <dt className="text-gray-500">Nome</dt>
            <dd className="font-medium">{candidate.nome}</dd>
          </div>
          <div className="flex justify-between gap-4 py-0.5">
            <dt className="text-gray-500">CPF</dt>
            <dd className="font-medium">{candidate.cpf ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 py-0.5">
            <dt className="text-gray-500">Matrículas</dt>
            <dd className="font-medium">{candidate.enrollmentsCount}</dd>
          </div>
          <div className="flex justify-between gap-4 py-0.5">
            <dt className="text-gray-500">Certificados válidos</dt>
            <dd className="font-medium">{candidate.certificatesCount}</dd>
          </div>
        </dl>
      </section>

      {/* 2 — quem é o aluno de verdade */}
      <section className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          2. Quem é o aluno de verdade
        </h4>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">
            Nome completo do aluno
          </span>
          <input
            type="text"
            value={nomeAluno}
            onChange={(e) => setNomeAluno(e.target.value)}
            placeholder="Nome de quem estuda e recebe o certificado"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {fieldErrors.nome && (
            <span className="mt-1 block text-xs text-red-600">
              {fieldErrors.nome}
            </span>
          )}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              CPF do aluno{" "}
              {exigeCpf ? (
                <span className="font-normal text-amber-700">(obrigatório)</span>
              ) : (
                <span className="font-normal text-gray-400">(opcional)</span>
              )}
            </span>
            <input
              type="text"
              value={cpfAluno}
              onChange={(e) => setCpfAluno(e.target.value)}
              placeholder="000.000.000-00"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            />
            <span className="mt-1 block text-xs text-gray-500">
              {exigeCpf
                ? "O CPF é impresso no certificado e conferido na validação pública — sem ele o documento sairia incompleto."
                : "Se não tiver em mãos, deixe em branco — a correção do nome não fica travada por isso."}
            </span>
            {fieldErrors.cpf && (
              <span className="mt-1 block text-xs text-red-600">
                {fieldErrors.cpf}
              </span>
            )}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              Data de nascimento do aluno
            </span>
            <input
              type="date"
              value={guardianCtl.nascimento}
              onChange={(e) => guardianCtl.setNascimento(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {fieldErrors.nascimento && (
              <span className="mt-1 block text-xs text-red-600">
                {fieldErrors.nascimento}
              </span>
            )}
          </label>
        </div>

        {!guardianCtl.open && (
          <button
            type="button"
            className="text-xs font-medium text-[var(--color-pmb-green)] underline underline-offset-2"
            onClick={() => guardianCtl.setManualOpen(true)}
          >
            Informar o responsável financeiro
          </button>
        )}
        {guardianCtl.open && (
          <GuardianFields
            value={guardianCtl.guardian}
            onChange={guardianCtl.setGuardian}
            fieldErrors={fieldErrors}
            disabled={saving}
            required={guardianCtl.required}
            variant="staff"
            showDeclaration={false}
            formatCpf={(v) => v}
            formatPhone={(v) => v}
          />
        )}
      </section>

      {/* 3 — o que vai acontecer */}
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          3. O que vai acontecer
        </h4>
        <ul className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            O cadastro passa a se chamar{" "}
            <strong>{nomeAluno.trim() || "…"}</strong>
          </li>
          {guardianCtl.guardian.responsavel && (
            <li className="flex gap-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>
                <strong>{guardianCtl.guardian.responsavel}</strong> passa a
                constar como responsável financeiro
              </span>
            </li>
          )}
          {candidate.certificatesCount > 0 && corrigirCertificados && (
            <li className="flex gap-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>
                {candidate.certificatesCount} certificado(s) será(ão) corrigido(s)
                para o nome do aluno.{" "}
                <strong>O código de validação continua o mesmo</strong> — quem
                já recebeu o código antigo continua conseguindo validar.
              </span>
            </li>
          )}
          <li className="flex gap-2 text-gray-500">
            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 text-center">–</span>
            Matrículas, pagamentos, o acesso às aulas e o login{" "}
            <strong>não mudam</strong>.
          </li>
        </ul>

        {candidate.certificatesCount > 0 && (
          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={corrigirCertificados}
              onChange={(e) => setCorrigirCertificados(e.target.checked)}
            />
            Corrigir também os certificados já emitidos
          </label>
        )}

        <label className="block">
          <span className="text-xs font-medium text-gray-700">
            Justificativa
          </span>
          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={2}
            placeholder="O que foi verificado (mínimo 10 caracteres)"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {fieldErrors.justificativa && (
            <span className="mt-1 block text-xs text-red-600">
              {fieldErrors.justificativa}
            </span>
          )}
        </label>

        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)}
          />
          Confirmo que verifiquei o documento do aluno.
        </label>
      </section>

      {erro && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {erro}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={submit}
          disabled={!pronto || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Corrigindo…" : "Aplicar correção"}
        </button>
      </div>
    </div>
  )
}
