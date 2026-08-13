/**
 * Tipos e rotulos da revisao de titularidade, SEM dependencia de Prisma.
 *
 * Vive separado de `signals.ts` de proposito: aquele arquivo consulta o banco, e
 * importar dele num componente `"use client"` arrastaria o driver `pg` para o
 * bundle do navegador (o build quebra com "Can't resolve 'dns'"). A fila precisa
 * dos rotulos no cliente e da consulta no servidor.
 */

export type TitularitySignal =
  | "CERTIFICADO_EMITIDO"
  | "NOME_CONTAMINADO"
  | "TELEFONE_REPETIDO"
  | "CPF_MULTI_NOME"
  | "MENOR_SEM_RESPONSAVEL"

export interface TitularityCandidate {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  nascimento: string | null
  responsavel: string | null
  tenantId: string
  tenantName: string | null
  certificatesCount: number
  enrollmentsCount: number
  signals: TitularitySignal[]
  /** Ordena a fila. Nao e probabilidade — e prioridade de revisao. */
  score: number
  revisadaEm: string | null
}

/** `Record` fechado: sinal novo sem rotulo quebra o build. */
export const SIGNAL_LABEL: Record<TitularitySignal, string> = {
  CERTIFICADO_EMITIDO: "Tem certificado emitido",
  NOME_CONTAMINADO: "Nome sugere responsável",
  TELEFONE_REPETIDO: "Telefone repetido com outro nome",
  CPF_MULTI_NOME: "Mesmo CPF com nomes diferentes",
  MENOR_SEM_RESPONSAVEL: "Menor sem responsável financeiro",
}
