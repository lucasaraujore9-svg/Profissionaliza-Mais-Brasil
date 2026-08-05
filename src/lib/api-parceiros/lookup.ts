import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizePhone } from "@/lib/validation/phone"
import {
  candidatosDeDominio,
  type IdentificadorResolvido,
  type TipoIdentificador,
} from "./identificador"
import {
  UNIDADE_SELECT,
  serializarUnidade,
  type UnidadeRecord,
  type UnidadePayload,
} from "./unidade-payload"

/**
 * Resolve um identificador único → unidade (revenda).
 *
 * Todos os caminhos partem de coluna ÚNICA e indexada, exceto `telefone` —
 * ver a nota no `porTelefone`.
 */

export type ResultadoLookup =
  | {
      tipo: "encontrado"
      unidade: UnidadePayload
      /** Qual leitura do valor de fato casou (importa quando houve dedução). */
      via: TipoIdentificador
    }
  | { tipo: "nao_encontrado" }
  /**
   * Duas origens: `telefone` (`User.phone` não tem unicidade) e a DEDUÇÃO do
   * `?q=`, onde o mesmo valor é lido como slug, id e código ao mesmo tempo — e
   * nada impede que o código de indicação de uma unidade seja igual ao slug de
   * outra. Nos dois casos a regra do contrato é a mesma: nunca escolher.
   */
  | { tipo: "multiplos"; quantidade: number }

export async function buscarUnidade(
  identificador: IdentificadorResolvido,
): Promise<ResultadoLookup> {
  const { tipo, valor, alternativas } = identificador

  if (tipo === "telefone") return porTelefone(valor)

  // Uma consulta só cobrindo todas as leituras plausíveis do mesmo valor
  // (slug/id/código na dedução). São colunas únicas: no máximo uma casa.
  const candidatos = [{ tipo, valor }, ...(alternativas ?? [])]
  const wheres = candidatos
    .filter((c) => c.tipo !== "telefone")
    .map((c) => whereDe(c.tipo as ExcetoTelefone, c.valor))

  // Campo explícito (`?slug=`) parte de coluna única: no máximo uma casa, e
  // `findFirst` bastaria. Na DEDUÇÃO do `?q=`, porém, o mesmo valor vira um `OR`
  // de slug + id + código — espaços de nomes independentes que podem colidir
  // entre unidades diferentes. `take: 2` custa o mesmo e é o que permite
  // distinguir "achei" de "achei mais de uma": sem isso a API escolheria uma em
  // silêncio, que é justamente o que o contrato promete nunca fazer.
  const achados = await prisma.tenant.findMany({
    where: wheres.length === 1 ? wheres[0]! : { OR: wheres },
    select: UNIDADE_SELECT,
    take: 2,
  })

  if (achados.length === 0) return { tipo: "nao_encontrado" }
  if (achados.length > 1) return { tipo: "multiplos", quantidade: achados.length }

  const tenant = achados[0]!
  return {
    tipo: "encontrado",
    unidade: serializarUnidade(tenant),
    via: viaQueCasou(tenant, candidatos, tipo),
  }
}

type ExcetoTelefone = Exclude<TipoIdentificador, "telefone">

function whereDe(tipo: ExcetoTelefone, valor: string): Prisma.TenantWhereInput {
  switch (tipo) {
    // O titular é a pessoa em `User` com `tenantId` preenchido — a relação
    // `TenantOwner` é 1-1 (User.tenantId é @unique). Membros da equipe da
    // unidade (TenantMember) NÃO são titulares e não resolvem por aqui.
    // `insensitive`: `User.email` NÃO é normalizado na escrita (o cadastro de
    // revenda grava o que a pessoa digitou), então um titular pode estar como
    // `Contato@Unidade.com.br`. Igualdade exata sobre o valor já minúsculo daria
    // 404 no caminho documentado como preferido. É o mesmo `mode` que o resto do
    // projeto usa para consultar e-mail.
    case "email":
      return { owner: { email: { equals: valor, mode: "insensitive" } } }
    case "cpf":
      return { owner: { cpf: valor } }
    case "id":
      return { id: valor }
    case "slug":
      return { slug: valor }
    case "dominio":
      return { customDomain: { in: candidatosDeDominio(valor) } }
    case "codigo":
      return { referralCode: valor }
  }
}

/**
 * Depois da consulta dá para saber qual leitura casou — e a resposta devolve
 * isso ao parceiro. Sem esta conferência, uma busca por código de indicação
 * deduzida do `?q=` seria reportada como "slug", e o dev do outro lado tiraria
 * a conclusão errada sobre o próprio dado.
 */
function viaQueCasou(
  tenant: UnidadeRecord,
  candidatos: { tipo: TipoIdentificador; valor: string }[],
  padrao: TipoIdentificador,
): TipoIdentificador {
  for (const candidato of candidatos) {
    if (candidato.tipo === "id" && tenant.id === candidato.valor) return "id"
    if (candidato.tipo === "slug" && tenant.slug === candidato.valor) return "slug"
    if (candidato.tipo === "codigo" && tenant.referralCode === candidato.valor) {
      return "codigo"
    }
  }
  return padrao
}

/**
 * Telefone é o único identificador SEM unicidade garantida:
 *   - `User.phone` não tem `@unique` — dois titulares podem repetir o número
 *     (escritório de contabilidade, sócio que abre duas unidades);
 *   - o valor foi gravado como a pessoa digitou. O cadastro antigo de revenda
 *     salvava o texto cru; só o /painel/configuracoes normaliza. Então
 *     `(11) 98765-4321`, `+5511987654321` e `11987654321` convivem na coluna e
 *     nenhum `where` de igualdade acha todos.
 *
 * Por isso comparamos em memória sobre o conjunto dos TITULARES — que é uma
 * linha por unidade (`User.tenantId` é `@unique`), na casa das centenas. Se a
 * rede crescer a ponto disso pesar, o caminho é normalizar o telefone na
 * ESCRITA e criar índice, não paginar esta varredura.
 *
 * Empate devolve `multiplos`: escolher um seria devolver silenciosamente a
 * unidade errada.
 */
async function porTelefone(valor: string): Promise<ResultadoLookup> {
  const titulares = await prisma.user.findMany({
    where: { tenantId: { not: null }, phone: { not: null } },
    select: { tenantId: true, phone: true },
  })

  const casaram = titulares.filter(
    (titular) => titular.phone && normalizePhone(titular.phone) === valor,
  )

  if (casaram.length === 0) return { tipo: "nao_encontrado" }
  if (casaram.length > 1) return { tipo: "multiplos", quantidade: casaram.length }

  const tenant = await prisma.tenant.findUnique({
    where: { id: casaram[0]!.tenantId! },
    select: UNIDADE_SELECT,
  })

  return tenant
    ? { tipo: "encontrado", unidade: serializarUnidade(tenant), via: "telefone" }
    : { tipo: "nao_encontrado" }
}
