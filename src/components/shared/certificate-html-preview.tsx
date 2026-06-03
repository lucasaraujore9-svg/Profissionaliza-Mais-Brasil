"use client"

import { useMemo } from "react"
import Image from "next/image"

export type CertificateLayout = "CLASSIC" | "MODERN" | "MINIMAL"

/**
 * Dados de um template de certificado usados para renderizar a prévia HTML.
 * É o mesmo shape editado pelo admin e o que resolveCertificateTemplate
 * devolve (mais o flag isActive, ignorado na prévia).
 */
export interface CertificateTemplateData {
  layout: CertificateLayout
  backgroundUrl: string | null
  logoUrl: string | null
  sealUrl: string | null
  signatureUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  titleText: string
  bodyText: string
  footerText: string | null
  signerName: string | null
  signerTitle: string | null
  showQrCode: boolean
  showValidationUrl: boolean
  showSeal: boolean
  isActive: boolean
}

export interface SampleData {
  nome: string
  cpf: string
  curso: string
  carga_horaria: string
  data_conclusao: string
  codigo: string
  unidade: string
}

/**
 * Dados fictícios usados na prévia. O certificado real usa os dados do aluno
 * e do curso. Mantido como função para resolver a data no cliente (evita
 * mismatch de hidratação ao usar `new Date()` no módulo).
 */
export function buildSampleData(unidade = "Sua Escola"): SampleData {
  return {
    nome: "Maria da Silva",
    cpf: "123.456.789-00",
    curso: "Curso Exemplo Profissionalizante",
    carga_horaria: "40h",
    data_conclusao: new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    codigo: "EXEMPLO-12345",
    unidade,
  }
}

const PLACEHOLDER_RE = /\{(nome|cpf|curso|carga_horaria|data_conclusao|codigo|unidade)\}/g

function resolvePlaceholders(text: string, sample: SampleData): string {
  return text.replace(PLACEHOLDER_RE, (_, k: keyof SampleData) => sample[k] ?? "")
}

interface Props {
  data: CertificateTemplateData
  /**
   * Logo do Grupo Bolsa Mais Brasil (selo "powered by") configurada em
   * SystemSettings pelo admin. Aparece no rodapé do preview de todos os
   * layouts. Null = mostra apenas o texto do `groupName`.
   */
  groupLogoUrl?: string | null
  /** Nome do grupo exibido junto ao selo. Default "Grupo Bolsa Mais Brasil". */
  groupName?: string
  /**
   * Dados de exemplo. Default = `buildSampleData()`. Permite ao chamador
   * personalizar a unidade exibida (ex.: nome real da escola no painel).
   */
  sample?: SampleData
}

/**
 * Prévia HTML fiel do certificado (CLASSIC/MODERN/MINIMAL) com dados de
 * exemplo. É uma aproximação visual instantânea — o PDF real é gerado pela
 * pipeline `@react-pdf/renderer`. Use o botão "Ver PDF real" para o resultado
 * exato.
 */
export function CertificateHtmlPreview({
  data,
  groupLogoUrl = null,
  groupName = "Grupo Bolsa Mais Brasil",
  sample,
}: Props) {
  const resolvedSample = useMemo(
    () => sample ?? buildSampleData(),
    [sample],
  )

  const bodyResolved = useMemo(
    () => resolvePlaceholders(data.bodyText, resolvedSample),
    [data.bodyText, resolvedSample],
  )

  const footerResolved = useMemo(() => {
    if (!data.footerText) return null
    return resolvePlaceholders(data.footerText, resolvedSample)
  }, [data.footerText, resolvedSample])

  const variantProps: PreviewVariantProps = {
    data,
    sample: resolvedSample,
    bodyResolved,
    footerResolved,
    groupLogoUrl,
    groupName,
  }

  if (data.layout === "MODERN") return <ModernPreview {...variantProps} />
  if (data.layout === "MINIMAL") return <MinimalPreview {...variantProps} />
  return <ClassicPreview {...variantProps} />
}

interface PreviewVariantProps {
  data: CertificateTemplateData
  sample: SampleData
  bodyResolved: string
  footerResolved: string | null
  groupLogoUrl: string | null
  groupName: string
}

function GroupBrandStripe({
  groupLogoUrl,
  groupName,
}: {
  groupLogoUrl: string | null
  groupName: string
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center justify-center gap-0.5 text-gray-400">
      {groupLogoUrl ? (
        <div className="relative h-3 w-12 sm:h-4 sm:w-16">
          <Image
            src={groupLogoUrl}
            alt={groupName}
            fill
            className="object-contain"
            unoptimized
          />
        </div>
      ) : null}
      <span className="text-[6px] sm:text-[7px] tracking-wider">
        Plataforma do {groupName}
      </span>
    </div>
  )
}

function ClassicPreview({
  data,
  sample,
  bodyResolved,
  footerResolved,
  groupLogoUrl,
  groupName,
}: PreviewVariantProps) {
  const primary = data.primaryColor ?? "#16653f"
  const secondary = data.secondaryColor ?? "#0f3d24"

  return (
    <div
      className="relative aspect-[1.41/1] w-full overflow-hidden rounded-xl border-4 shadow-lg"
      style={{
        borderColor: primary,
        background: data.backgroundUrl ? `url(${data.backgroundUrl})` : "white",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {data.backgroundUrl && <div className="absolute inset-0 bg-white/75" />}

      <div
        className="absolute inset-2 sm:inset-3 rounded-md"
        style={{ border: `1px solid ${secondary}` }}
      />

      <div className="relative flex h-full flex-col items-center justify-between p-4 sm:p-6 md:p-8 text-center">
        <div className="flex w-full items-start justify-between gap-3">
          {data.logoUrl ? (
            <div className="relative h-10 w-24 sm:h-12 sm:w-32">
              <Image
                src={data.logoUrl}
                alt="Logo"
                fill
                className="object-contain object-left"
                unoptimized
              />
            </div>
          ) : (
            <div className="h-10 w-24" />
          )}
          {data.showSeal && data.sealUrl ? (
            <div className="relative h-10 w-10 sm:h-14 sm:w-14">
              <Image
                src={data.sealUrl}
                alt="Selo"
                fill
                className="object-contain object-right"
                unoptimized
              />
            </div>
          ) : (
            <div className="h-10 w-10" />
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1
            className="text-base font-bold tracking-wider sm:text-lg md:text-2xl"
            style={{ color: primary }}
          >
            {data.titleText}
          </h1>
          <p
            className="max-w-prose text-xs leading-relaxed sm:text-sm"
            style={{ color: "#1F2937" }}
          >
            {bodyResolved}
          </p>
          <p
            className="text-lg sm:text-xl md:text-2xl font-bold"
            style={{ color: secondary }}
          >
            {sample.nome}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-700">
            Curso: {sample.curso} · {sample.carga_horaria} · {sample.data_conclusao}
          </p>
        </div>

        <div className="flex w-full items-end justify-between gap-3">
          <div className="text-left text-[10px] sm:text-xs">
            <div className="text-gray-500">
              Código:{" "}
              <span className="font-mono font-semibold" style={{ color: secondary }}>
                {sample.codigo}
              </span>
            </div>
            {data.showValidationUrl && (
              <div className="text-[9px] text-gray-500">
                profissionalizamaisbrasil.com.br/validar
              </div>
            )}
            {footerResolved && (
              <div className="text-[9px] text-gray-500 mt-1 max-w-[200px]">
                {footerResolved}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center text-[10px] sm:text-xs">
            {data.signatureUrl && (
              <div className="relative mb-1 h-6 w-24 sm:h-8 sm:w-28">
                <Image
                  src={data.signatureUrl}
                  alt="Assinatura"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            )}
            <div
              className="border-t pt-1 text-center"
              style={{ borderColor: "#1F2937", minWidth: 120 }}
            >
              <div className="font-semibold" style={{ color: "#1F2937" }}>
                {data.signerName ?? "—"}
              </div>
              <div className="text-[9px] text-gray-500">{data.signerTitle ?? ""}</div>
            </div>
          </div>

          <div className="text-right">
            {data.showQrCode && (
              <div className="inline-block h-12 w-12 sm:h-14 sm:w-14 border border-dashed border-gray-400 bg-white p-1 text-[8px] leading-tight text-gray-500">
                QR
              </div>
            )}
          </div>
        </div>
      </div>

      <GroupBrandStripe groupLogoUrl={groupLogoUrl} groupName={groupName} />
    </div>
  )
}

function ModernPreview({
  data,
  sample,
  bodyResolved,
  footerResolved,
  groupLogoUrl,
  groupName,
}: PreviewVariantProps) {
  const primary = data.primaryColor ?? "#16653f"
  const secondary = data.secondaryColor ?? "#0f3d24"

  return (
    <div
      className="relative aspect-[1.41/1] w-full overflow-hidden rounded-xl border border-gray-200 shadow-lg"
      style={{
        background: data.backgroundUrl ? `url(${data.backgroundUrl})` : "white",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {data.backgroundUrl && <div className="absolute inset-0 bg-white/85" />}

      <div className="relative flex h-full">
        {/* Sidebar */}
        <div
          className="flex w-[28%] flex-col items-center justify-between p-3 sm:p-4 md:p-5"
          style={{ backgroundColor: primary }}
        >
          <div className="flex w-full justify-center">
            {data.logoUrl ? (
              <div className="relative h-10 w-full sm:h-14">
                <Image
                  src={data.logoUrl}
                  alt="Logo"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="text-center text-[9px] sm:text-[10px] text-white tracking-widest uppercase">
                {sample.unidade}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            {data.showSeal && data.sealUrl && (
              <div className="relative h-10 w-10 sm:h-14 sm:w-14">
                <Image
                  src={data.sealUrl}
                  alt="Selo"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            )}
            <div className="text-center text-[9px] sm:text-[10px] text-white tracking-widest uppercase">
              {sample.unidade}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-between p-3 sm:p-5 md:p-7">
          <div>
            <div
              className="text-[9px] sm:text-[10px] font-bold tracking-[0.4em]"
              style={{ color: primary }}
            >
              CERTIFICADO
            </div>
            <h1
              className="mt-1 text-sm sm:text-lg md:text-2xl font-bold tracking-wider"
              style={{ color: secondary }}
            >
              {data.titleText}
            </h1>
            <p className="mt-2 text-[10px] sm:text-xs text-gray-700 leading-relaxed">
              {bodyResolved}
            </p>

            <div className="mt-2 text-[8px] sm:text-[9px] tracking-[0.3em] uppercase text-gray-400">
              Aluno(a)
            </div>
            <div
              className="text-lg sm:text-2xl md:text-3xl font-bold leading-tight"
              style={{ color: secondary }}
            >
              {sample.nome}
            </div>
            <div
              className="mt-1 h-[2px] w-12 sm:w-16"
              style={{ backgroundColor: primary }}
            />

            <div className="mt-2 text-[9px] sm:text-[10px] text-gray-700 space-y-0.5">
              <div>
                <span className="text-gray-500">Curso: </span>
                {sample.curso}
              </div>
              <div>
                <span className="text-gray-500">Carga horária: </span>
                {sample.carga_horaria}
              </div>
              <div>
                <span className="text-gray-500">Conclusão: </span>
                {sample.data_conclusao}
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2">
            <div className="text-[10px] sm:text-xs">
              {data.signatureUrl && (
                <div className="relative mb-1 h-5 w-20 sm:h-7 sm:w-28">
                  <Image
                    src={data.signatureUrl}
                    alt="Assinatura"
                    fill
                    className="object-contain object-left"
                    unoptimized
                  />
                </div>
              )}
              <div
                className="border-t pt-1"
                style={{ borderColor: "#1F2937", minWidth: 100 }}
              >
                <div className="font-semibold" style={{ color: "#1F2937" }}>
                  {data.signerName ?? "—"}
                </div>
                <div className="text-[8px] sm:text-[9px] text-gray-500">
                  {data.signerTitle ?? ""}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end text-right">
              {data.showQrCode && (
                <div className="h-10 w-10 sm:h-14 sm:w-14 border border-dashed border-gray-400 bg-white p-1 text-[8px] leading-tight text-gray-500 flex items-center justify-center">
                  QR
                </div>
              )}
              <div
                className="mt-1 text-[9px] sm:text-[10px] font-bold font-mono"
                style={{ color: primary }}
              >
                {sample.codigo}
              </div>
              {data.showValidationUrl && (
                <div className="text-[7px] sm:text-[8px] text-gray-400">
                  profissionalizamaisbrasil.com.br/validar
                </div>
              )}
            </div>
          </div>

          {footerResolved && (
            <div className="mt-2 text-[8px] sm:text-[9px] text-gray-500">
              {footerResolved}
            </div>
          )}
        </div>
      </div>

      <GroupBrandStripe groupLogoUrl={groupLogoUrl} groupName={groupName} />
    </div>
  )
}

function MinimalPreview({
  data,
  sample,
  bodyResolved,
  footerResolved,
  groupLogoUrl,
  groupName,
}: PreviewVariantProps) {
  const primary = data.primaryColor ?? "#16653f"
  const secondary = data.secondaryColor ?? "#0f3d24"

  return (
    <div
      className="relative aspect-[1.41/1] w-full overflow-hidden rounded-xl border border-gray-200 shadow-lg bg-white"
      style={{
        background: data.backgroundUrl ? `url(${data.backgroundUrl})` : "white",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {data.backgroundUrl && <div className="absolute inset-0 bg-white/90" />}

      {/* Top bar de cor */}
      <div
        className="absolute left-0 right-0 top-0 h-1.5"
        style={{ backgroundColor: primary }}
      />

      <div className="relative flex h-full flex-col p-4 pt-6 sm:p-6 sm:pt-8 md:p-8 md:pt-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          {data.logoUrl ? (
            <div className="relative h-7 w-20 sm:h-9 sm:w-28">
              <Image
                src={data.logoUrl}
                alt="Logo"
                fill
                className="object-contain object-left"
                unoptimized
              />
            </div>
          ) : (
            <div className="text-[8px] sm:text-[9px] tracking-[0.3em] uppercase text-gray-500">
              {sample.unidade}
            </div>
          )}
          <div className="text-[8px] sm:text-[9px] tracking-[0.3em] uppercase text-gray-500">
            {sample.unidade}
          </div>
        </div>

        {/* Title */}
        <div className="mt-4 sm:mt-6">
          <div
            className="text-xs sm:text-sm md:text-base font-bold tracking-[0.4em]"
            style={{ color: primary }}
          >
            {data.titleText}
          </div>
          <div
            className="mt-1 h-[2px] w-8 sm:w-10"
            style={{ backgroundColor: primary }}
          />
        </div>

        {/* Name and body */}
        <div className="mt-3 sm:mt-4">
          <div className="text-[10px] sm:text-xs text-gray-500">Certificamos que</div>
          <div
            className="text-xl sm:text-3xl md:text-4xl font-bold leading-tight"
            style={{ color: secondary }}
          >
            {sample.nome}
          </div>
          <p className="mt-2 max-w-[80%] text-[10px] sm:text-xs leading-relaxed text-gray-700">
            {bodyResolved}
          </p>
        </div>

        {/* Meta */}
        <div className="mt-3 sm:mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[10px] sm:text-xs">
          <div>
            <div className="text-[8px] sm:text-[9px] tracking-widest uppercase text-gray-400">
              Curso
            </div>
            <div style={{ color: "#1F2937" }}>{sample.curso}</div>
          </div>
          <div>
            <div className="text-[8px] sm:text-[9px] tracking-widest uppercase text-gray-400">
              Carga horária
            </div>
            <div style={{ color: "#1F2937" }}>{sample.carga_horaria}</div>
          </div>
          <div>
            <div className="text-[8px] sm:text-[9px] tracking-widest uppercase text-gray-400">
              Conclusão
            </div>
            <div style={{ color: "#1F2937" }}>{sample.data_conclusao}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="text-[10px] sm:text-xs">
            {data.signatureUrl && (
              <div className="relative mb-1 h-5 w-20 sm:h-7 sm:w-28">
                <Image
                  src={data.signatureUrl}
                  alt="Assinatura"
                  fill
                  className="object-contain object-left"
                  unoptimized
                />
              </div>
            )}
            <div
              className="border-t pt-1"
              style={{ borderColor: "#1F2937", minWidth: 100 }}
            >
              <div className="font-semibold" style={{ color: "#1F2937" }}>
                {data.signerName ?? "—"}
              </div>
              <div className="text-[8px] sm:text-[9px] text-gray-500">
                {data.signerTitle ?? ""}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end text-right">
            {data.showQrCode && (
              <div className="h-9 w-9 sm:h-12 sm:w-12 border border-dashed border-gray-400 bg-white p-1 text-[8px] leading-tight text-gray-500 flex items-center justify-center">
                QR
              </div>
            )}
            <div
              className="mt-1 text-[9px] sm:text-[10px] font-bold font-mono"
              style={{ color: primary }}
            >
              {sample.codigo}
            </div>
            {data.showValidationUrl && (
              <div className="text-[7px] sm:text-[8px] text-gray-400">
                profissionalizamaisbrasil.com.br/validar
              </div>
            )}
          </div>
        </div>

        {footerResolved && (
          <div className="mt-1 text-center text-[7px] sm:text-[8px] text-gray-400">
            {footerResolved}
          </div>
        )}
      </div>

      <GroupBrandStripe groupLogoUrl={groupLogoUrl} groupName={groupName} />
    </div>
  )
}
