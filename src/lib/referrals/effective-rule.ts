/**
 * FONTE UNICA da regra de comissao de indicacao.
 *
 * Antes existiam duas fontes concorrentes para o mesmo numero:
 *   - `Tenant.referralPercent` / `referralTiers`, lidos do tenant INDICADO
 *   - `Tenant.commission*` (mode/rateType/brackets/plan), lidos do tenant INDICADOR
 * As duas eram editaveis em cards diferentes da mesma tela, gravavam a mesma
 * coluna por vias diferentes e discordavam entre si — quem configurava 50% no
 * card errado via o sistema pagar o padrao global.
 *
 * Agora ha uma so regra e ela pertence ao INDICADOR: o bloco `commission*`.
 * O relogio das fases continua sendo o de cada unidade INDICADA (ver
 * `monthly.ts`), porque "primeiros N meses" e sempre sobre a vida da indicada.
 *
 * Este modulo e o unico lugar que decide a regra efetiva. `monthly.ts` (motor)
 * e a UI (preview) consomem a MESMA funcao — e por isso que a tela nao pode
 * mais mostrar um percentual diferente do que o fechamento paga.
 */
import { contextLogger } from "@/lib/logger";
import {
  parseBrackets,
  parsePlan,
  parsePlanSettings,
  DEFAULT_PLAN_SETTINGS,
  type CommissionBracket,
  type CommissionPhase,
  type CommissionPlanSettings,
  type GlobalCommissionConfig,
  type TenantCommissionOverride,
} from "@/lib/referrals/rules";

/**
 * Ultimo recurso, quando NADA esta configurado — nem regra propria, nem regra
 * global, nem sequer a linha de SystemSettings. Espelham os `@default` do schema
 * (`defaultReferralPercent 5.00`, `defaultReferralMinReferrals 3`) de proposito:
 * ter um numero aqui diferente do banco recria, em menor escala, a mesma
 * divergencia que esta unificacao veio eliminar.
 */
export const FALLBACK_PERCENT = 5;
export const FALLBACK_MIN_REFERRALS = 3;

/** De onde veio a regra que esta valendo — exibido no preview da UI. */
export type CommissionSource =
  | "tenant.plan" // plano multi-fase proprio da unidade
  | "tenant.brackets" // faixas proprias da unidade (fase unica)
  | "global.plan" // plano multi-fase global
  | "global.brackets" // faixas globais (fase unica)
  | "fallback.percent"; // nada configurado: percentual padrao global

export interface EffectiveCommission {
  /** Fases efetivas. Nunca vazio — ha sempre um fallback. */
  phases: CommissionPhase[];
  /**
   * Ajustes de topo do plano vencedor (relogio das fases + janela promocional).
   * Regras que nao vem de um plano usam o padrao historico (`months`, sem janela).
   */
  settings: CommissionPlanSettings;
  /** Minimo de indicacoes ATIVAS para o indicador comecar a receber. 0 = sem minimo. */
  minReferrals: number;
  source: CommissionSource;
  /** Inconsistencias que a UI deve mostrar ao admin. Nao bloqueiam o calculo. */
  warnings: string[];
}

/**
 * Campos do indicador necessarios para resolver a regra.
 *
 * `commissionMode` NAO entra: com motor unico ele nao roteia mais nada — o
 * fechamento mensal apura todo indicador. A coluna segue no banco so como
 * historico, e exigi-la aqui obrigaria cada chamador a carregar um campo
 * irrelevante.
 */
export type ReferrerCommissionInput = Omit<
  TenantCommissionOverride,
  "commissionMode"
> & {
  commissionPlan?: unknown;
  referralMinReferrals?: number | null;
};

/**
 * Campos globais (SystemSettings) necessarios para resolver a regra.
 *
 * Tudo e opcional/anulavel de proposito: o chamador passa a linha CRUA do banco
 * (ou `null`, se ela nem existir) e quem aplica os defaults e este modulo. Antes
 * cada tela repetia o seu proprio `?? "MONTHLY_TIERED"` / `?? 5` / `?? 3` — tres
 * chamadores, tres defaults diferentes, exatamente o tipo de divergencia que
 * fez a tela anunciar um percentual e o sistema pagar outro.
 */
export type GlobalCommissionInput = {
  [K in keyof GlobalCommissionConfig]?: GlobalCommissionConfig[K] | null;
} & {
  commissionPlan?: unknown;
  defaultReferralPercent?: unknown;
  defaultReferralMinReferrals?: number | null;
};

/** Uma fase unica "em diante" com percentual sobre a mensalidade de cada ativa. */
export function percentToPhases(percent: number): CommissionPhase[] {
  return [
    {
      durationMonths: null,
      rateType: "PERCENT",
      bracketBasis: "ACTIVE_UNITS",
      payoutBase: "ALL_ACTIVE",
      brackets: [{ upTo: null, value: percent }],
    },
  ];
}

function readPercent(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Resolve a regra efetiva de um INDICADOR.
 *
 * Precedencia: plano da unidade -> faixas da unidade -> plano global -> faixas
 * globais -> percentual padrao global. Ao contrario de `resolveEffectivePhases`,
 * NUNCA devolve lista vazia: antes, um indicador em modo por faixas sem nenhuma
 * faixa configurada era pulado no fechamento e recebia R$ 0 sem erro nenhum.
 */
export function resolveEffectiveCommission(
  referrer: ReferrerCommissionInput | null,
  global: GlobalCommissionInput | null,
): EffectiveCommission {
  const g: GlobalCommissionInput = global ?? {};
  const warnings: string[] = [];
  const defaultPercent = readPercent(
    g.defaultReferralPercent,
    FALLBACK_PERCENT,
  );
  const minReferrals =
    referrer?.referralMinReferrals ??
    g.defaultReferralMinReferrals ??
    FALLBACK_MIN_REFERRALS;

  const rawOverridePlan = referrer?.commissionPlan;
  const overridePlan = referrer ? parsePlan(rawOverridePlan) : [];
  if (overridePlan.length > 0) {
    return {
      phases: overridePlan,
      settings: parsePlanSettings(rawOverridePlan),
      minReferrals,
      source: "tenant.plan",
      warnings,
    };
  }
  if (hasContent(rawOverridePlan)) {
    warnings.push(
      "O plano de fases desta unidade esta invalido e foi ignorado — verifique as faixas de cada fase.",
    );
  }

  const rawOverrideBrackets = referrer?.commissionBrackets;
  const overrideBrackets = referrer ? parseBrackets(rawOverrideBrackets) : [];
  if (overrideBrackets.length > 0) {
    // Merge campo a campo com o global (mesma semantica de resolveCommissionRule,
    // sem o `mode`, que nao roteia mais nada).
    return {
      phases: [
        {
          durationMonths: null,
          rateType:
            referrer?.commissionRateType ?? g.commissionRateType ?? "PERCENT",
          bracketBasis:
            referrer?.commissionBracketBasis ??
            g.commissionBracketBasis ??
            "ACTIVE_UNITS",
          payoutBase:
            referrer?.commissionPayoutBase ??
            g.commissionPayoutBase ??
            "ALL_ACTIVE",
          brackets: overrideBrackets,
        },
      ],
      settings: DEFAULT_PLAN_SETTINGS,
      minReferrals,
      source: "tenant.brackets",
      warnings,
    };
  }
  if (hasContent(rawOverrideBrackets)) {
    warnings.push(
      "As faixas proprias desta unidade estao invalidas e foram ignoradas — a regra global esta valendo.",
    );
  }

  const globalPlan = parsePlan(g.commissionPlan);
  if (globalPlan.length > 0) {
    return {
      phases: globalPlan,
      settings: parsePlanSettings(g.commissionPlan),
      minReferrals,
      source: "global.plan",
      warnings,
    };
  }

  const globalBrackets = parseBrackets(g.commissionBrackets);
  if (globalBrackets.length > 0 && !isDegenerate(globalBrackets)) {
    return {
      phases: [
        {
          durationMonths: null,
          rateType: g.commissionRateType ?? "PERCENT",
          bracketBasis: g.commissionBracketBasis ?? "ACTIVE_UNITS",
          payoutBase: g.commissionPayoutBase ?? "ALL_ACTIVE",
          brackets: globalBrackets,
        },
      ],
      settings: DEFAULT_PLAN_SETTINGS,
      minReferrals,
      source: "global.brackets",
      warnings,
    };
  }
  if (globalBrackets.length > 0) {
    warnings.push(
      `A regra global tem todas as faixas zeradas (pagaria R$ 0) — aplicando o percentual padrao de ${defaultPercent}%.`,
    );
  }

  return {
    phases: percentToPhases(defaultPercent),
    settings: DEFAULT_PLAN_SETTINGS,
    minReferrals,
    source: "fallback.percent",
    warnings,
  };
}

const SOURCE_LABEL: Record<CommissionSource, string> = {
  "tenant.plan": "plano proprio desta unidade",
  "tenant.brackets": "regra propria desta unidade",
  "global.plan": "plano padrao global",
  "global.brackets": "regra padrao global",
  "fallback.percent": "percentual padrao global",
};

function formatMoney(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function formatRate(rateType: string, value: number): string {
  return rateType === "PERCENT"
    ? `${String(value).replace(".", ",")}% da mensalidade`
    : `${formatMoney(value)} por unidade`;
}

function describePhase(phase: CommissionPhase): string {
  const rate =
    phase.brackets.length === 1
      ? formatRate(phase.rateType, phase.brackets[0].value)
      : phase.brackets
          .map((b) =>
            b.upTo === null
              ? `acima disso ${formatRate(phase.rateType, b.value)}`
              : `ate ${b.upTo} ${formatRate(phase.rateType, b.value)}`,
          )
          .join("; ");
  // Mapa exaustivo: um ternario binario descrevia PAID_THIS_MONTH como
  // "so sobre as indicadas naquele mes" — o oposto do que o motor faz.
  const BASE_LABEL: Record<CommissionPhase["payoutBase"], string> = {
    ALL_ACTIVE: "sobre todas as indicadas ativas",
    REFERRED_THIS_MONTH: "so sobre as indicadas naquele mes",
    PAID_THIS_MONTH: "so sobre as que pagaram a mensalidade no mes",
  };
  return `${rate}, ${BASE_LABEL[phase.payoutBase]}`;
}

/**
 * Frase unica que descreve a regra efetiva, gerada a partir do MESMO objeto que
 * o motor usa. E o que a tela mostra em "Regra efetiva hoje" — se a frase
 * estiver errada, o pagamento tambem esta.
 */
export function describeEffectiveCommission(rule: EffectiveCommission): string {
  // Com relogio por fatura, `durationMonths` conta FATURAS. Descrever como
  // "meses" faria a tela anunciar uma promocao por calendario onde o motor
  // conta a 1a mensalidade paga.
  const porFatura = rule.settings.clock === "paidInvoices";
  const parts = rule.phases.map((phase, i) => {
    const unidade = porFatura
      ? phase.durationMonths === 1
        ? "fatura paga"
        : "faturas pagas"
      : phase.durationMonths === 1
        ? "mes"
        : "meses";
    const when =
      phase.durationMonths === null
        ? rule.phases.length === 1
          ? ""
          : "depois disso: "
        : `${i === 0 ? (porFatura ? "primeiras" : "primeiros") : porFatura ? "proximas" : "proximos"} ${phase.durationMonths} ${unidade} de cada indicada: `;
    return `${when}${describePhase(phase)}`;
  });
  const janela = rule.settings.promoPaidUntil
    ? ` Promocao valida para faturas pagas ate ${rule.settings.promoPaidUntil.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
    : "";
  const gate =
    rule.minReferrals > 0
      ? ` Comeca a receber a partir de ${rule.minReferrals} ${
          rule.minReferrals === 1 ? "indicacao ativa" : "indicacoes ativas"
        }.`
      : "";
  return `${parts.join(" · ")} (origem: ${SOURCE_LABEL[rule.source]}).${janela}${gate}`;
}

/** True se o JSON tinha algo que o parser descartou (config invalida, nao ausente). */
function hasContent(value: unknown): boolean {
  return Array.isArray(value)
    ? value.length > 0
    : value != null && typeof value === "object";
}

/** Faixas que pagariam R$ 0 em qualquer contagem — tratadas como "nao configurado". */
function isDegenerate(brackets: CommissionBracket[]): boolean {
  return brackets.every((b) => b.value <= 0);
}

/**
 * Igual a `resolveEffectiveCommission`, mas registra no log quando a regra caiu
 * no fallback ou trouxe avisos. Usado pelo motor (o preview da UI nao loga).
 */
export function resolveEffectiveCommissionForEngine(
  referrer: (ReferrerCommissionInput & { id: string }) | null,
  global: GlobalCommissionInput | null,
): EffectiveCommission {
  const resolved = resolveEffectiveCommission(referrer, global);
  if (resolved.source === "fallback.percent" || resolved.warnings.length > 0) {
    contextLogger().warn(
      {
        event: "referrals.rule_fallback",
        referrerTenantId: referrer?.id ?? null,
        source: resolved.source,
        warnings: resolved.warnings,
      },
      "regra de comissao resolvida por fallback",
    );
  }
  return resolved;
}
