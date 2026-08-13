import type { StudentStatus, ApostilaStatus } from "@prisma/client"
import type { EAEditarAlunoParams } from "@/lib/plataforma-cursos/types"

/**
 * Tradução do nosso estado para os campos de `usuarios/novo` / `usuarios/editar`
 * da plataforma de aulas (EA) — e a regra de que TODA edição carrega o estado.
 *
 * ⚠️ POR QUE ISTO EXISTE (incidente de 2026-08-05)
 *
 * `usuarios/editar` NÃO é um PATCH. Campo omitido não é "campo preservado": a
 * plataforma reescreve o cadastro com o default dela. O default de `status` é
 * `interessado` (um lead do CRM deles, sem acesso às aulas).
 *
 * A troca de senha mandava `usuarios/editar` com apenas `id_aluno` + `senha`.
 * Resultado em produção: uma aluna com matrícula ACTIVE e curso vinculado
 * amanheceu como "Interessado" na plataforma e perdeu o acesso — sem nenhum
 * registro do lado de cá, porque o nosso banco continuava `ATIVO`/`LIBERADA`.
 *
 * Regra que fecha a classe inteira do bug: **todo `usuarios/editar` sai daqui**,
 * e todo payload daqui carrega `status`, `apostila` e `bolsista`. Nunca mais
 * mandar uma edição parcial de campo de estado.
 *
 * Valores confirmados contra a coleção oficial da API v2 (2026-08-10):
 *   status    → ativo | inativo | bloqueado | devedor | formado | interessado
 *   apostila  → liberar | bloquear
 *   bolsista  → s | n
 *   (`senha` NÃO existe em nenhum dos dois endpoints — ver
 *    `changeStudentPlatformPassword`.)
 */

export const EA_STATUS_BY_LOCAL: Record<StudentStatus, string> = {
  ATIVO: "ativo",
  INATIVO: "inativo",
  BLOQUEADO: "bloqueado",
  DEVEDOR: "devedor",
  FORMADO: "formado",
  INTERESSADO: "interessado",
}

export const EA_APOSTILA_BY_LOCAL: Record<ApostilaStatus, string> = {
  LIBERADA: "liberar",
  BLOQUEADA: "bloquear",
}

/**
 * `usuarios/listar` devolve o status em caixa alta (`"ATIVO"`). Normalizamos
 * para comparar o que está lá com o que deveria estar (ver
 * `/api/cron/resync-platform-state`).
 */
export function parseEaStatus(value: unknown): StudentStatus | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (!raw) return null
  return raw in EA_STATUS_BY_LOCAL ? (raw as StudentStatus) : null
}

/** `bolsista` volta como "S"/"N"/null no `usuarios/listar`. */
export function parseEaBolsista(value: unknown): boolean | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (raw === "S") return true
  if (raw === "N") return false
  return null
}

/**
 * O retrato do aluno que NÓS somos donos e reasseveramos na plataforma a cada
 * edição. Campos fora desta lista (`certificado`, `datafinal`, `obs`,
 * `vendedor`, `funcionario_cadastro`) são deliberadamente NÃO enviados: não
 * temos valor autoritativo para eles, e mandar o nosso default apagaria o que a
 * plataforma tem. Se um dia a plataforma resetar algum deles numa edição, é
 * aqui que entra o campo — junto com a fonte da verdade dele.
 *
 * `responsavel`/`rg_responsavel`/`cpf_responsavel` ESTAVAM nessa lista de
 * exclusões, com a justificativa "não temos valor autoritativo". Isso deixou de
 * valer: desde o responsável financeiro, o formulário de venda COLETA esses
 * dados e nós passamos a ser a fonte da verdade deles. Mantê-los fora agora
 * deixaria a plataforma de aulas sem saber quem responde pelo aluno menor.
 */
export interface PlatformStudentSnapshot {
  nome: string
  email: string | null
  fone: string | null
  fone2: string | null
  cpf: string | null
  rg: string | null
  sexo: string | null
  nascimento: Date | null
  responsavel: string | null
  rgResponsavel: string | null
  cpfResponsavel: string | null
  rua: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  polo: string | null
  status: StudentStatus
  apostila: ApostilaStatus
  bolsista: boolean
}

export interface PlatformStateOverrides {
  status?: StudentStatus
  apostila?: ApostilaStatus
  /**
   * Bolsista EFETIVO na plataforma. Não é `Student.bolsista` puro: a flag local
   * significa "bolsa institucional concedida numa venda direta", enquanto a
   * plataforma usa `bolsista` para "não vincule cobrança a este aluno". Quem
   * entrou por cupom de 100% cai no segundo caso sem ter o primeiro — ver
   * `resolvePlatformBolsista`.
   */
  bolsista?: boolean
}

function isoDate(value: Date | null): string | undefined {
  if (!value) return undefined
  return value.toISOString().slice(0, 10)
}

function text(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

/**
 * Monta o payload de `usuarios/editar`.
 *
 * - Estado (`status`/`apostila`/`bolsista`): SEMPRE presente. É o que impede a
 *   plataforma de cair no default `interessado`.
 * - Perfil: só o que temos preenchido. `undefined` é descartado pelo client
 *   (`buildFormData`), então campo vazio do nosso lado preserva o que estiver
 *   lá — asseveramos o que sabemos, não apagamos o que não sabemos.
 */
export function buildEditarAlunoPayload(
  plataformaAlunoId: number,
  snapshot: PlatformStudentSnapshot,
  overrides: PlatformStateOverrides & { senha?: string } = {},
): EAEditarAlunoParams {
  const status = overrides.status ?? snapshot.status
  const apostila = overrides.apostila ?? snapshot.apostila
  const bolsista = overrides.bolsista ?? snapshot.bolsista

  return {
    id_aluno: plataformaAlunoId,

    // ── Estado: nunca omitido ──────────────────────────────────────────────
    status: EA_STATUS_BY_LOCAL[status],
    apostila: EA_APOSTILA_BY_LOCAL[apostila],
    bolsista: bolsista ? "S" : "N",

    // ── Perfil: só o que temos ────────────────────────────────────────────
    nome: text(snapshot.nome),
    email: text(snapshot.email),
    fone: text(snapshot.fone),
    fone2: text(snapshot.fone2),
    cpf: text(snapshot.cpf),
    rg: text(snapshot.rg),
    sexo: text(snapshot.sexo),
    nascimento: isoDate(snapshot.nascimento),
    // `text()` descarta vazio, então responsável nulo do nosso lado PRESERVA o
    // que a plataforma tiver. Mandar string vazia para forçar a limpeza seria a
    // mesma classe do incidente de 2026-08-05 (campo omitido/zerado derrubando
    // o aluno para "interessado") — não fazer.
    responsavel: text(snapshot.responsavel),
    rg_responsavel: text(snapshot.rgResponsavel),
    cpf_responsavel: text(snapshot.cpfResponsavel),
    rua: text(snapshot.rua),
    numero: text(snapshot.numero),
    bairro: text(snapshot.bairro),
    cidade: text(snapshot.cidade),
    estado: text(snapshot.estado),
    cep: text(snapshot.cep),
    polo: text(snapshot.polo),

    ...(overrides.senha ? { senha: overrides.senha } : {}),
  }
}
