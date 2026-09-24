"use client"

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
export function buildSampleData(unidade = "Profissionaliza Mais Brasil"): SampleData {
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
  // Variaveis do certificado sao sempre exibidas em MAIUSCULO (regra de
  // negocio — espelha upperCert da pipeline do PDF). Uppercase aqui garante
  // que a previa bata com o PDF real, qualquer que seja o `sample` recebido.
  const resolvedSample = useMemo(() => {
    const base = sample ?? buildSampleData()
    return {
      nome: base.nome.toUpperCase(),
      cpf: base.cpf.toUpperCase(),
      curso: base.curso.toUpperCase(),
      carga_horaria: base.carga_horaria.toUpperCase(),
      data_conclusao: base.data_conclusao.toUpperCase(),
      codigo: base.codigo.toUpperCase(),
      unidade: base.unidade.toUpperCase(),
    }
  }, [sample])

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

  return (
    <ScaledSheet>
      {data.layout === "MODERN" ? (
        <ModernPreview {...variantProps} />
      ) : data.layout === "MINIMAL" ? (
        <MinimalPreview {...variantProps} />
      ) : (
        <ClassicPreview {...variantProps} />
      )}
    </ScaledSheet>
  )
}

/**
 * Largura de desenho da folha = A4 paisagem em pt (842), a mesma pagina do
 * PDF — com 1px ~ 1pt, as fontes da previa ficam na proporcao do documento
 * real. O certificado e diagramado UMA vez nesse tamanho e reduzido por
 * `transform: scale` ate a largura do conteiner.
 * Breakpoints de viewport (sm:/md:) nao servem aqui: a mesma previa aparece
 * num card estreito e num painel largo NA MESMA TELA, e o card recebia a
 * fonte do painel e estourava a folha (rodape, QR e assinatura cortados).
 */
const SHEET_WIDTH = 842
const SHEET_RATIO = 842 / 595

function ScaledSheet({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / SHEET_WIDTH)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="relative w-full" style={{ aspectRatio: SHEET_RATIO }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: SHEET_WIDTH,
          height: SHEET_WIDTH / SHEET_RATIO,
          transform: `scale(${scale ?? 0})`,
          visibility: scale === null ? "hidden" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
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
        <div className="relative h-4 w-16">
          <Image
            src={groupLogoUrl}
            alt={groupName}
            fill
            className="object-contain"
            unoptimized
          />
        </div>
      ) : null}
      <span className="text-[7px] tracking-wider">
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
      className="relative h-full w-full overflow-hidden rounded-xl border-4 shadow-lg"
      style={{
        borderColor: primary,
        background: data.backgroundUrl ? `url(${data.backgroundUrl})` : "white",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {data.backgroundUrl && <div className="absolute inset-0 bg-white/75" />}

      <div
        className="absolute inset-3 rounded-md"
        style={{ border: `1px solid ${secondary}` }}
      />

      <div className="relative flex h-full flex-col items-center justify-between p-8 text-center">
        <div className="flex w-full items-start justify-between gap-3">
          {data.logoUrl ? (
            <div className="relative h-12 w-32">
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
            <div className="relative h-14 w-14">
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
            className="text-2xl font-bold tracking-wider"
            style={{ color: primary }}
          >
            {data.titleText}
          </h1>
          <p
            className="max-w-prose text-sm leading-relaxed"
            style={{ color: "#1F2937" }}
          >
            {bodyResolved}
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: secondary }}
          >
            {sample.nome}
          </p>
          <p className="text-xs text-gray-700">CPF: {sample.cpf}</p>
          <p className="text-xs text-gray-700">
            Curso: {sample.curso} · {sample.carga_horaria} · {sample.data_conclusao}
          </p>
          <p className="text-xs text-gray-700">
            Aproveitamento: 100%
          </p>
        </div>

        <div className="flex w-full items-end justify-between gap-3">
          <div className="text-left text-xs">
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

          <div className="flex flex-col items-center text-xs">
            {data.signatureUrl && (
              <div className="relative mb-1 h-8 w-28">
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
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-gray-200 bg-white p-1 text-[8px] leading-tight text-gray-500 shadow-sm">
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
      className="relative h-full w-full overflow-hidden rounded-xl border border-gray-200 shadow-lg"
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
          className="flex w-[28%] flex-col items-center justify-between p-5"
          style={{ backgroundColor: primary }}
        >
          <div className="flex w-full justify-center">
            {data.logoUrl ? (
              <div className="relative h-14 w-full">
                <Image
                  src={data.logoUrl}
                  alt="Logo"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="text-center text-[10px] text-white tracking-widest uppercase">
                {sample.unidade}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            {data.showSeal && data.sealUrl && (
              <div className="relative h-14 w-14">
                <Image
                  src={data.sealUrl}
                  alt="Selo"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            )}
            <div className="text-center text-[10px] text-white tracking-widest uppercase">
              {sample.unidade}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-between p-7">
          <div>
            <div
              className="text-[10px] font-bold tracking-[0.4em]"
              style={{ color: primary }}
            >
              CERTIFICADO
            </div>
            <h1
              className="mt-1 text-2xl font-bold tracking-wider"
              style={{ color: secondary }}
            >
              {data.titleText}
            </h1>
            <p className="mt-2 text-xs text-gray-700 leading-relaxed">
              {bodyResolved}
            </p>

            <div className="mt-2 text-[9px] tracking-[0.3em] uppercase text-gray-400">
              Aluno(a)
            </div>
            <div
              className="text-3xl font-bold leading-tight"
              style={{ color: secondary }}
            >
              {sample.nome}
            </div>
            <div
              className="mt-1 h-[2px] w-16"
              style={{ backgroundColor: primary }}
            />

            <div className="mt-2 text-[10px] text-gray-700 space-y-0.5">
              <div>
                <span className="text-gray-500">CPF: </span>
                {sample.cpf}
              </div>
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
              <div>
                <span className="text-gray-500">Aproveitamento: </span>
                100%
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2">
            <div className="text-xs">
              {data.signatureUrl && (
                <div className="relative mb-1 h-7 w-28">
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
                <div className="text-[9px] text-gray-500">
                  {data.signerTitle ?? ""}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end text-right">
              {data.showQrCode && (
                <div className="h-14 w-14 rounded-md border border-gray-200 bg-white p-1 text-[8px] leading-tight text-gray-500 shadow-sm flex items-center justify-center">
                  QR
                </div>
              )}
              <div
                className="mt-1 text-[10px] font-bold font-mono"
                style={{ color: primary }}
              >
                {sample.codigo}
              </div>
              {data.showValidationUrl && (
                <div className="text-[8px] text-gray-400">
                  profissionalizamaisbrasil.com.br/validar
                </div>
              )}
            </div>
          </div>

          {footerResolved && (
            <div className="mt-2 text-[9px] text-gray-500">
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
      className="relative h-full w-full overflow-hidden rounded-xl border border-gray-200 shadow-lg bg-white"
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

      <div className="relative flex h-full flex-col p-8 pt-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          {data.logoUrl ? (
            <div className="relative h-9 w-28">
              <Image
                src={data.logoUrl}
                alt="Logo"
                fill
                className="object-contain object-left"
                unoptimized
              />
            </div>
          ) : (
            <div className="text-[9px] tracking-[0.3em] uppercase text-gray-500">
              {sample.unidade}
            </div>
          )}
          <div className="text-[9px] tracking-[0.3em] uppercase text-gray-500">
            {sample.unidade}
          </div>
        </div>

        {/* Title */}
        <div className="mt-6">
          <div
            className="text-base font-bold tracking-[0.4em]"
            style={{ color: primary }}
          >
            {data.titleText}
          </div>
          <div
            className="mt-1 h-[2px] w-10"
            style={{ backgroundColor: primary }}
          />
        </div>

        {/* Name and body */}
        <div className="mt-4">
          <div className="text-xs text-gray-500">Certificamos que</div>
          <div
            className="text-4xl font-bold leading-tight"
            style={{ color: secondary }}
          >
            {sample.nome}
          </div>
          <p className="mt-2 max-w-[80%] text-xs leading-relaxed text-gray-700">
            {bodyResolved}
          </p>
        </div>

        {/* Meta */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <div>
            <div className="text-[9px] tracking-widest uppercase text-gray-400">
              Curso
            </div>
            <div style={{ color: "#1F2937" }}>{sample.curso}</div>
          </div>
          <div>
            <div className="text-[9px] tracking-widest uppercase text-gray-400">
              CPF
            </div>
            <div style={{ color: "#1F2937" }}>{sample.cpf}</div>
          </div>
          <div>
            <div className="text-[9px] tracking-widest uppercase text-gray-400">
              Carga horária
            </div>
            <div style={{ color: "#1F2937" }}>{sample.carga_horaria}</div>
          </div>
          <div>
            <div className="text-[9px] tracking-widest uppercase text-gray-400">
              Conclusão
            </div>
            <div style={{ color: "#1F2937" }}>{sample.data_conclusao}</div>
          </div>
          <div>
            <div className="text-[9px] tracking-widest uppercase text-gray-400">
              Aproveitamento
            </div>
            <div style={{ color: "#1F2937" }}>100%</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="text-xs">
            {data.signatureUrl && (
              <div className="relative mb-1 h-7 w-28">
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
              <div className="text-[9px] text-gray-500">
                {data.signerTitle ?? ""}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end text-right">
            {data.showQrCode && (
              <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white p-1 text-[8px] leading-tight text-gray-500 shadow-sm">
                QR
              </div>
            )}
            <div
              className="mt-1 text-[10px] font-bold font-mono"
              style={{ color: primary }}
            >
              {sample.codigo}
            </div>
            {data.showValidationUrl && (
              <div className="text-[8px] text-gray-400">
                profissionalizamaisbrasil.com.br/validar
              </div>
            )}
          </div>
        </div>

        {footerResolved && (
          <div className="mt-1 text-center text-[8px] text-gray-400">
            {footerResolved}
          </div>
        )}
      </div>

      <GroupBrandStripe groupLogoUrl={groupLogoUrl} groupName={groupName} />
    </div>
  )
}
