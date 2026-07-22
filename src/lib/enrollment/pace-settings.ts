/**
 * Interruptores da cota de aulas. Modulo minusculo e separado do motor
 * (`pace.ts`) de proposito: a trava de CERTIFICADO precisa consultar o
 * interruptor sem arrastar as integracoes de plataforma (EA/LMS) para dentro do
 * caminho de emissao.
 */
import { prisma } from "@/lib/prisma"

const SETTINGS_ID = "default"

export interface PaceGateSettings {
  /** A cota esta valendo para esta unidade? */
  enabled: boolean
  /**
   * Politica do corte na plataforma de aulas:
   *   false (padrao) — so corta o login quando TODAS as matriculas dele estao
   *                    travadas (o status da EA e por login, nao por curso);
   *   true           — corta assim que qualquer matricula bate a cota.
   */
  strict: boolean
}

/**
 * Resolve o interruptor para uma unidade. `Tenant.paceGateEnabled` (null =
 * herda) tem precedencia sobre o global — permite pilotar numa unidade antes de
 * ligar na rede toda, ou desligar onde o parcelamento longo tornaria a cota
 * agressiva demais.
 *
 * Nunca lanca: sem SystemSettings gravado, a cota fica DESLIGADA (fail-closed
 * para a feature, fail-open para o aluno — na duvida ninguem e travado).
 */
export async function resolvePaceGateSettings(
  tenantId: string | null,
): Promise<PaceGateSettings> {
  const [settings, tenant] = await Promise.all([
    prisma.systemSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { paceGateEnabled: true, paceGateStrict: true },
    }),
    tenantId
      ? prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { paceGateEnabled: true },
        })
      : Promise.resolve(null),
  ])

  return {
    enabled: tenant?.paceGateEnabled ?? settings?.paceGateEnabled ?? false,
    strict: settings?.paceGateStrict ?? false,
  }
}
