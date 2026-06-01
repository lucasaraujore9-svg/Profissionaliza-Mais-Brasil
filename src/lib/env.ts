import { z } from "zod"

/**
 * Validação centralizada de variáveis de ambiente.
 *
 * Por que existe:
 *   - Antes cada arquivo fazia `process.env.X` ad-hoc. Se a env faltasse, o
 *     erro só aparecia em runtime, em rotas diferentes, com mensagens
 *     diferentes. Dev novo perdia tempo descobrindo qual env é obrigatória.
 *   - Agora há um único schema. `env.X` é tipado, fail-fast no boot, e
 *     documenta requisitos.
 *
 * Regra de uso:
 *   - Para envs obrigatórias em produção, importe `env` deste módulo.
 *   - Para envs opcionais (features que podem ficar desligadas), use `optionalEnv`.
 *   - NÃO leia `process.env.X` diretamente em código novo — sempre via env.ts.
 *
 * Boot:
 *   - O schema valida lazy (na 1ª leitura). Para fail-fast no startup,
 *     importe `assertEnv()` em src/app/layout.tsx ou em um init bootstrap.
 */

// Durante `next build` (coleta de page-data), o Next define NEXT_PHASE. Nessa
// fase NÃO exigimos as envs de runtime: importar uma rota para coletar metadata
// não deve travar o build por falta de um secret de integração (ex.: Preview
// deploy sem ASAAS_WEBHOOK_TOKEN). A validação fail-closed continua valendo em
// RUNTIME (NEXT_PHASE ausente), inclusive em produção — apenas o build deixa de
// derrubar. Isso concretiza a intenção já documentada do proxy lazy abaixo.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"
const isProd = process.env.NODE_ENV === "production" && !isBuildPhase

/**
 * `requiredInProd(name, schema)` — opcional em dev, obrigatório em prod.
 * Evita travar `npm run dev` quando o dev local não configurou todas as
 * integrações. Também é relaxado durante o build (ver `isBuildPhase`).
 */
function requiredInProd<T extends z.ZodTypeAny>(schema: T) {
  return isProd ? schema : schema.optional()
}

const envSchema = z.object({
  // ── App / domains ────────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z.string().url().default("https://profissionalizamaisbrasil.com.br"),
  NEXT_PUBLIC_APP_DOMAIN: z.string().min(1).default("profissionalizamaisbrasil.com.br"),
  NEXT_PUBLIC_VITRINE_DOMAIN: z.string().min(1).default("livrecursos.com.br"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ── Banco ────────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  DIRECT_URL: z.string().optional(),

  // ── Auth ─────────────────────────────────────────────────────────────────
  // NextAuth aceita AUTH_SECRET (v5 oficial) ou NEXTAUTH_SECRET (legado).
  // Exigir pelo menos um — sem isso JWTs são assinados com secret aleatório
  // a cada restart e todas as sessões invalidam silenciosamente.
  AUTH_SECRET: z.string().min(32).optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // ── Cripto ───────────────────────────────────────────────────────────────
  // Hex de 64 chars (= 32 bytes). Validado de novo em src/lib/crypto.ts.
  ENCRYPTION_KEY: requiredInProd(z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY deve ser 64 chars hex (32 bytes)")),

  // ── Redis / rate limiting ────────────────────────────────────────────────
  // Opcional em qualquer ambiente: sem Redis o rate-limit fica liberado
  // (assertEnv emite warning em prod). Aceita string vazia (Vercel às vezes
  // injeta "" em vez de unset) — tratada como ausente por quem consome.
  UPSTASH_REDIS_REST_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .pipe(z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // ── Webhooks ─────────────────────────────────────────────────────────────
  // ASAAS_WEBHOOK_TOKEN obrigatório em prod (webhook rejeita sem ele).
  // MP_WEBHOOK_SECRET opcional: na ausência, processador MP em prod
  // rejeita o webhook (linha 257 de mercadopago/process.ts). Não derruba
  // a app — só impede fulfillment automático até a env ser configurada.
  ASAAS_WEBHOOK_TOKEN: requiredInProd(z.string().min(16, "ASAAS_WEBHOOK_TOKEN curto demais (>=16)")),
  MP_WEBHOOK_SECRET: z.string().min(16, "MP_WEBHOOK_SECRET curto demais (>=16)").optional(),

  // ── Cron / interno ───────────────────────────────────────────────────────
  CRON_SECRET: requiredInProd(z.string().min(32, "CRON_SECRET deve ter >=32 chars (openssl rand -hex 32)")),
  INTERNAL_SECRET: requiredInProd(z.string().min(32, "INTERNAL_SECRET deve ter >=32 chars")),

  // ── Integrações ──────────────────────────────────────────────────────────
  EA_API_URL: requiredInProd(z.string().url()),
  EA_API_TOKEN: requiredInProd(z.string().min(1)),
  // URL pública do portal do aluno na plataforma parceira (botão "ir para
  // a plataforma" no painel do aluno). Opcional — sem isso o botão some.
  EA_STUDENT_LOGIN_URL: z.string().url().optional(),
  // Pool max conexões — override de tuning. Default 10 (boa pra Vercel +
  // Supabase Pooler). Aumentar só sob carga real.
  DATABASE_POOL_MAX: z.string().regex(/^\d+$/).optional(),
  ASAAS_API_URL: requiredInProd(z.string().url()),
  ASAAS_API_KEY: requiredInProd(z.string().min(1)),

  // Vercel (gerencia DNS de custom domains dos revendedores)
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  // Email — SMTP preferido, Resend como fallback
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // Web Push (opcional — sem isso só fica desabilitado o botão)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // PMB (vitrine principal — tenantId=null)
  PMB_MP_ACCESS_TOKEN: z.string().optional(),
  PMB_PLATAFORMA_VENDEDOR_ID: z.string().optional(),
  PMB_PLATAFORMA_POLO: z.string().optional(),
  PMB_EA_VENDEDOR_ID: z.string().optional(),
  PMB_EA_POLO: z.string().optional(),

  // Observabilidade (opcional — preferimos Vercel Log Drain configurado
  // no dashboard; estas envs ligam um fan-out HTTP direto pra Axiom).
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).optional(),
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
  AXIOM_URL: z.string().url().optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

function parse(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(
      `[env] Variáveis de ambiente inválidas ou ausentes:\n${issues}\n\nConsulte .env.example.`,
    )
  }
  return result.data
}

/**
 * Proxy lazy: a 1ª leitura valida e cacheia. Validação no momento certo
 * (evita parsear durante build de páginas estáticas que não precisam de tudo).
 */
export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    if (!cached) cached = parse()
    return cached[key as keyof Env]
  },
})

/**
 * Use no boot do app (ex: import side-effect em src/app/layout.tsx) para
 * forçar fail-fast quando algo essencial estiver faltando em prod.
 */
export function assertEnv(): void {
  if (!cached) cached = parse()

  // Avisos não-fatais (degradam features mas não derrubam a app).
  // Usa JSON inline pra evitar import circular com logger (env é importado
  // no boot via instrumentation.ts, antes do logger ser inicializado).
  if (cached.NODE_ENV === "production") {
    if (!cached.UPSTASH_REDIS_REST_URL || !cached.UPSTASH_REDIS_REST_TOKEN) {
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({
        level: "warn",
        event: "env.redis_missing",
        msg: "Redis (Upstash) não configurado em produção — rate-limit DESLIGADO. Configure UPSTASH_REDIS_REST_*.",
        time: new Date().toISOString(),
      }))
    }
    if (!cached.MP_WEBHOOK_SECRET) {
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({
        level: "warn",
        event: "env.mp_webhook_secret_missing",
        msg: "MP_WEBHOOK_SECRET ausente em produção — webhooks do Mercado Pago serão REJEITADOS. Configure no painel MP + Vercel.",
        time: new Date().toISOString(),
      }))
    }
    if (!cached.AUTH_SECRET && !cached.NEXTAUTH_SECRET) {
      throw new Error(
        "[env] AUTH_SECRET (ou NEXTAUTH_SECRET) é obrigatório em produção. Gere com: openssl rand -hex 32",
      )
    }
  }
}

/**
 * Helper: NextAuth secret de fato usado pela aplicação.
 * Mantém compatibilidade com `AUTH_SECRET` (v5) e `NEXTAUTH_SECRET` (legado).
 */
export function authSecret(): string | undefined {
  return env.AUTH_SECRET ?? env.NEXTAUTH_SECRET
}
