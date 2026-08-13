"use client"

import { GraduationCap, CreditCard, Calendar, ShieldCheck } from "lucide-react"
import type { StudentData } from "./types"

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR")
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Nunca"
  return new Date(iso).toLocaleString("pt-BR")
}

export function OverviewTab({ student }: { student: StudentData }) {
  const activeCount = student.enrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "COMPLETED",
  ).length

  return (
    <div className="space-y-5">
      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          icon={GraduationCap}
          label="Cursos ativos"
          value={`${activeCount}`}
        />
        <Metric icon={CreditCard} label="Total pago" value={brl(student.totalPaid)} mono />
        <Metric
          icon={Calendar}
          label="Cadastro"
          value={formatDate(student.createdAt)}
        />
        <Metric
          icon={ShieldCheck}
          label="Último login"
          value={formatDateTime(student.lastLoginAt)}
        />
      </div>

      {/* Dados pessoais */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Dados pessoais
          </h2>
        </header>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 p-4 sm:grid-cols-3">
          <InfoField label="Email" value={student.email} />
          <InfoField label="CPF" value={student.cpf} />
          <InfoField label="Telefone" value={student.fone} />
          <InfoField label="Telefone 2" value={student.fone2} />
          <InfoField
            label="Nascimento"
            value={student.nascimento ? formatDate(student.nascimento) : null}
          />
          <InfoField
            label="Endereço"
            value={
              [student.rua, student.numero, student.bairro]
                .filter(Boolean)
                .join(", ") || null
            }
          />
          <InfoField
            label="Cidade/UF"
            value={
              [student.cidade, student.estado].filter(Boolean).join(" / ") ||
              null
            }
          />
          <InfoField label="CEP" value={student.cep} />
          <InfoField label="Origem" value={student.tenantName} />
        </dl>
        {/* Só aparece quando existe — a maioria dos alunos é adulta e paga por
            si. O certificado usa `nome`/`cpf` do ALUNO, nunca estes campos. */}
        {student.responsavel && (
          <div className="border-t border-gray-100 px-4 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Responsável financeiro
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              <InfoField label="Nome" value={student.responsavel} />
              <InfoField label="CPF" value={student.cpfResponsavel} />
              <InfoField label="Parentesco" value={student.responsavelParentesco} />
              <InfoField label="E-mail" value={student.responsavelEmail} />
              <InfoField label="Telefone" value={student.responsavelFone} />
              <InfoField label="RG" value={student.rgResponsavel} />
            </dl>
            <p className="mt-3 text-xs text-gray-500">
              A cobrança sai no CPF do responsável. O certificado é emitido no
              nome do aluno.
            </p>
          </div>
        )}
      </section>

      {/* Identificadores técnicos */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Plataforma & integrações
          </h2>
        </header>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 p-4 sm:grid-cols-3">
          <InfoField
            label="ID plataforma de aulas"
            value={student.plataformaAlunoId}
            mono
          />
          <InfoField label="Status na plataforma" value={student.status} />
          <InfoField label="Apostila" value={student.apostila} />
          <InfoField label="Cliente Asaas" value={student.asaasCustomerId} mono />
          <InfoField
            label="Senha criada em"
            value={
              student.passwordSetAt
                ? formatDateTime(student.passwordSetAt)
                : "Não definida"
            }
          />
        </dl>
      </section>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof GraduationCap
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </p>
      </div>
      <p
        className={`mt-2 text-lg font-bold text-[var(--color-pmb-green-900)] ${mono ? "font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  )
}

function InfoField({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm ${mono ? "font-mono" : ""}`}>
        {value ?? <span className="text-gray-400">—</span>}
      </dd>
    </div>
  )
}
