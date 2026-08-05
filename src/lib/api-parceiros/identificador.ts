import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { apexDomain } from "@/lib/tenant/urls"

/**
 * Classificação e normalização do identificador recebido em /api/v1.
 *
 * O parceiro pode nomear o campo (`?email=`, `?cpf=`…) — forma preferida,
 * determinística — ou mandar um valor solto em `?q=` e deixar a API adivinhar.
 *
 * A ambiguidade real está nos 11 dígitos: CPF e celular com DDD têm o mesmo
 * comprimento. Resolvemos pelo dígito verificador — `52998224725` é CPF,
 * `11987654321` não passa no DV e cai como telefone. É por isso que `q` só é
 * conveniência: quem quer garantia usa o campo nomeado.
 */

export const TIPOS_IDENTIFICADOR = [
  /** E-mail de login do titular da unidade (User.email, único). */
  "email",
  /** CPF do titular (User.cpf, único, gravado só em dígitos). */
  "cpf",
  /** Telefone do titular (User.phone). NÃO é único no banco — pode dar 409. */
  "telefone",
  /** Id do tenant (cuid). */
  "id",
  /** Slug da unidade = subdomínio da vitrine. */
  "slug",
  /** Domínio próprio apontado pela unidade (com ou sem www). */
  "dominio",
  /** Código de indicação da unidade (Tenant.referralCode). */
  "codigo",
] as const

export type TipoIdentificador = (typeof TIPOS_IDENTIFICADOR)[number]

export interface IdentificadorResolvido {
  tipo: TipoIdentificador
  /** Valor já normalizado para consulta (CPF em dígitos, slug minúsculo…). */
  valor: string
  /** Valor cru como o parceiro enviou — ecoado na resposta para conferência. */
  original: string
  /**
   * Outras leituras possíveis do MESMO valor, preenchidas só na dedução (`?q=`
   * ou path). Um texto como `JOAO2026` tem forma de slug E de código de
   * indicação; um cuid tem forma de slug E de id. Como a dedução não consulta o
   * banco para desempatar, o lookup testa todas numa consulta só — são todas
   * colunas únicas — em vez de devolver 404 para um identificador válido.
   *
   * Vazio quando o parceiro nomeou o campo: aí o tipo é contrato, não palpite.
   */
  alternativas?: { tipo: TipoIdentificador; valor: string }[]
}

export type ResolucaoIdentificador =
  | { ok: true; identificador: IdentificadorResolvido }
  | { ok: false; motivo: "ausente" | "ambiguo" | "invalido"; campo?: string }

const SLUG_RE = /^[a-z0-9_-]{1,64}$/
const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
const CUID_RE = /^[a-z0-9]{20,40}$/i
// Deliberadamente permissivo: a validação que importa é a do banco (o e-mail ou
// existe ou não). Um regex rígido demais só recusaria e-mail válido exótico.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Lê os parâmetros da query e devolve UM identificador.
 *
 * Recusa dois campos ao mesmo tempo (`?email=…&cpf=…`) em vez de eleger um: se
 * o parceiro mandou os dois e eles apontam para unidades diferentes, qualquer
 * escolha nossa seria silenciosamente errada para ele.
 */
export function resolverDaQuery(params: URLSearchParams): ResolucaoIdentificador {
  const informados = TIPOS_IDENTIFICADOR.map((tipo) => ({
    tipo,
    valor: params.get(tipo)?.trim() ?? "",
  })).filter((item) => item.valor.length > 0)

  const q = params.get("q")?.trim() ?? ""

  if (informados.length === 0 && !q) return { ok: false, motivo: "ausente" }
  if (informados.length > 1) return { ok: false, motivo: "ambiguo" }
  if (informados.length === 1 && q) return { ok: false, motivo: "ambiguo" }

  if (informados.length === 1) {
    const { tipo, valor } = informados[0]!
    return normalizar(tipo, valor)
  }

  return adivinhar(q)
}

/** Normaliza e valida a forma de um identificador de tipo conhecido. */
export function normalizar(
  tipo: TipoIdentificador,
  bruto: string,
): ResolucaoIdentificador {
  const original = bruto.trim()
  const invalido = (): ResolucaoIdentificador => ({
    ok: false,
    motivo: "invalido",
    campo: tipo,
  })

  switch (tipo) {
    case "email": {
      const valor = original.toLowerCase()
      if (!EMAIL_RE.test(valor)) return invalido()
      return { ok: true, identificador: { tipo, valor, original } }
    }
    case "cpf": {
      // O DV é conferido aqui de propósito: sem isso, "00000000000" viraria
      // uma consulta ao banco a cada tentativa de enumeração.
      if (!isValidCpf(original)) return invalido()
      return { ok: true, identificador: { tipo, valor: stripCpf(original), original } }
    }
    case "telefone": {
      if (!isValidPhone(original)) return invalido()
      return {
        ok: true,
        identificador: { tipo, valor: normalizePhone(original), original },
      }
    }
    case "id": {
      if (!CUID_RE.test(original)) return invalido()
      return { ok: true, identificador: { tipo, valor: original, original } }
    }
    case "slug": {
      const valor = original.toLowerCase()
      if (!SLUG_RE.test(valor)) return invalido()
      return { ok: true, identificador: { tipo, valor, original } }
    }
    case "dominio": {
      // Aceita URL completa, host com www ou host cru — o parceiro costuma ter
      // a URL, não o apex canônico que guardamos em Tenant.customDomain.
      const host = extrairHost(original)
      if (!host || !DOMAIN_RE.test(host)) return invalido()
      return { ok: true, identificador: { tipo, valor: host, original } }
    }
    case "codigo": {
      const valor = original.toUpperCase()
      if (!/^[A-Z0-9_-]{4,32}$/.test(valor)) return invalido()
      return { ok: true, identificador: { tipo, valor, original } }
    }
  }
}

/**
 * Ordem de tentativa do `?q=`: das formas mais específicas para as mais
 * genéricas, para que um valor nunca seja capturado por um tipo mais frouxo.
 *   1. tem "@"          → e-mail
 *   2. só dígitos       → CPF (se o DV bater) senão telefone
 *   3. tem "." ou "/"   → domínio
 *   4. resto            → slug e/ou código de indicação
 *
 * O id (cuid) não tem passo próprio: ele casa com a forma de slug e é resolvido
 * junto — a busca por slug que não acha nada cai no `id` pela mesma via do
 * `tambemComo`. Quem tem o id na mão e quer garantia usa `?id=`.
 */
export function adivinhar(bruto: string): ResolucaoIdentificador {
  const original = bruto.trim()
  if (!original) return { ok: false, motivo: "ausente" }

  if (original.includes("@")) return normalizar("email", original)

  const digitos = original.replace(/\D/g, "")
  const soDigitos = digitos.length === original.replace(/[\s().+-]/g, "").length

  if (soDigitos && digitos.length >= 10) {
    if (isValidCpf(digitos)) return normalizar("cpf", digitos)
    if (isValidPhone(digitos)) return normalizar("telefone", digitos)
    return { ok: false, motivo: "invalido", campo: "q" }
  }

  if (original.includes("/") || original.includes(".")) {
    return normalizar("dominio", original)
  }

  // Slug, id (cuid) e código de indicação são indistinguíveis pela forma: um
  // cuid passa no regex de slug, e um código como "JOAO2026" também. Todos são
  // colunas ÚNICAS, então resolvemos as três de uma vez no lookup em vez de
  // eleger uma e errar. `tipo` fica no palpite mais provável; qual delas de
  // fato casou é decidido depois da consulta.
  const comoSlug = normalizar("slug", original)
  if (comoSlug.ok) {
    const alternativas: { tipo: TipoIdentificador; valor: string }[] = []
    const comoId = normalizar("id", original)
    if (comoId.ok) alternativas.push({ tipo: "id", valor: comoId.identificador.valor })
    const comoCodigo = normalizar("codigo", original)
    if (comoCodigo.ok) {
      alternativas.push({ tipo: "codigo", valor: comoCodigo.identificador.valor })
    }
    return {
      ok: true,
      identificador: { ...comoSlug.identificador, alternativas },
    }
  }

  return normalizar("codigo", original)
}

/** Extrai o host de uma URL completa ou devolve o próprio valor já em minúsculas. */
function extrairHost(valor: string): string | null {
  const bruto = valor.trim().toLowerCase()
  if (!bruto) return null
  try {
    const url = new URL(bruto.includes("://") ? bruto : `https://${bruto}`)
    return url.hostname || null
  } catch {
    return null
  }
}

/**
 * Variantes de host que devem casar com `Tenant.customDomain`. O canônico é
 * gravado na forma apex, mas o parceiro pode ter só a URL com `www.` —
 * mesmíssima razão do `/api/internal/resolve-tenant`.
 */
export function candidatosDeDominio(host: string): string[] {
  const apex = apexDomain(host)
  return Array.from(new Set([host, apex, `www.${apex}`]))
}
