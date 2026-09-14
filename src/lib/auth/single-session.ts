import { randomUUID } from "node:crypto"

/**
 * UM ACESSO POR VEZ para a conta de aluno.
 *
 * Vale para toda modalidade (curso avulso, pacote, assinatura): a regra é da
 * CONTA, não do produto. Cada login grava um identificador novo em
 * `Student.activeSessionId` e o JWT carrega o dele (`sid`). Quando os dois não
 * batem, a sessão é recusada — o login num segundo aparelho derruba o primeiro
 * (decisão do dono: derrubar o anterior, e não barrar o novo, para ninguém
 * ficar trancado para fora por ter esquecido um computador logado).
 *
 * A plataforma de aulas própria aplica a mesma regra do lado dela e as duas se
 * enxergam:
 *  - login no PMB  -> `PUT /students/:id/session` (a sessão de lá cai);
 *  - SSO do PMB    -> leva o `sid` junto (é o MESMO acesso, não derruba nada);
 *  - login direto la -> webhook `student.session.started` (a sessão daqui cai).
 *
 * FORA DO ALCANCE: a plataforma legada. O aluno entra direto no site dela com
 * login e senha próprios, a API não tem sessão e não deixa trocar a senha — não
 * há onde aplicar a regra.
 *
 * Módulo PURO (sem Prisma): o callback `jwt` e o webhook chamam as decisões
 * daqui, e o teste as segura sem banco.
 */

/** Identificador novo de sessão. Opaco: não carrega nada além de ser único. */
export function newStudentSessionId(): string {
  return `pmb_${randomUUID()}`
}

export interface StudentTokenSession {
  /** `sid` gravado no JWT no login. Ausente em JWT emitido antes da regra. */
  sid?: string | null
  /**
   * Sessão aberta por "entrar como" do suporte. Não disputa o lugar do aluno:
   * sem esta exceção, atender alguém derrubaria a pessoa atendida.
   */
  impersonatedBy?: string | null
}

/**
 * A sessão deste JWT ainda é a que vale?
 *
 * JWT sem `sid` é RECUSADO (fail-closed): são os tokens emitidos antes da regra,
 * que ficariam vivos por até 30 dias — exatamente os aparelhos que já dividem a
 * conta hoje. O custo é o aluno entrar de novo uma vez depois do deploy.
 */
export function studentSessionIsCurrent(
  token: StudentTokenSession,
  activeSessionId: string | null,
): boolean {
  if (token.impersonatedBy) return true
  if (!token.sid || !activeSessionId) return false
  return token.sid === activeSessionId
}

/**
 * Um login DIRETO na plataforma de aulas (senha digitada lá) derruba a sessão
 * daqui?
 *
 * Só se a sessão daqui for ANTERIOR ao login de lá. O webhook tem retentativa
 * com backoff de horas: sem esta comparação, um evento atrasado derrubaria um
 * login feito aqui muito DEPOIS — e o aluno sairia sozinho sem motivo nenhum.
 * Os dois relógios são de máquinas diferentes, então o empate só é ambíguo na
 * janela de desvio do NTP (milissegundos).
 */
export function lmsLoginEndsPmbSession(
  pmb: { activeSessionId: string | null; activeSessionAt: Date | null },
  lmsLoginAt: Date,
): boolean {
  if (!pmb.activeSessionId) return false
  // Sessão sem data (não deveria existir: as duas colunas nascem juntas no
  // login) é tratada como antiga — a regra protege a conta, não o aparelho.
  if (!pmb.activeSessionAt) return true
  return pmb.activeSessionAt.getTime() < lmsLoginAt.getTime()
}
