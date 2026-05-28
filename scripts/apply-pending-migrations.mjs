#!/usr/bin/env node
/**
 * Aplica migrations idempotentes durante o `npm run build`.
 *
 * Por que isso existe:
 *   O fluxo oficial seria `prisma migrate deploy`, mas o time não usa
 *   (provavelmente por compatibilidade com Prisma 7 beta + Supabase pooler).
 *   O antigo script no `package.json` listava cada `prisma db execute --file`
 *   hardcoded — toda nova migration exigia editar o package.json, o que era
 *   esquecido com frequência.
 *
 * O que faz:
 *   1. Lista todos os SQLs em `prisma/migrations/*\/migration.sql`
 *      em ordem alfabética (que coincide com data prefix YYYYMMDD).
 *   2. Mantém uma tabela `_pmb_applied_migrations` com hash do conteúdo e
 *      filename — só aplica o que ainda não rodou.
 *   3. Aplica via `pg` (mesmo client do app, sem dependência extra).
 *   4. Migrations devem ser idempotentes (IF NOT EXISTS) — defesa contra
 *      execução duplicada caso a tabela de tracking caia/migre.
 *
 * Como adicionar uma migration nova:
 *   - Crie `prisma/migrations/YYYYMMDD_descricao/migration.sql`.
 *   - Escreva SQL idempotente (CREATE TABLE/INDEX IF NOT EXISTS; DO $$ ... $$
 *     pra constraints; ALTER TABLE ... ADD COLUMN IF NOT EXISTS).
 *   - Pronto. O script descobre sozinho no próximo build.
 *
 * Bypass:
 *   `SKIP_PENDING_MIGRATIONS=1 npm run build` pula tudo (útil em local
 *   quando você só quer compilar o front).
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import process from "node:process"
import pg from "pg"

const { Client } = pg

const MIGRATIONS_DIR = resolve(process.cwd(), "prisma/migrations")
const TRACKING_TABLE = "_pmb_applied_migrations"
const MIGRATION_LOCK_ID = 727274

if (process.env.SKIP_PENDING_MIGRATIONS === "1") {
  console.log("[apply-pending] SKIP_PENDING_MIGRATIONS=1 — pulando.")
  process.exit(0)
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("[apply-pending] DATABASE_URL não definida. Abortando.")
  process.exit(1)
}

function listMigrationFiles() {
  let entries
  try {
    entries = readdirSync(MIGRATIONS_DIR)
  } catch (err) {
    console.error(`[apply-pending] Não consegui ler ${MIGRATIONS_DIR}:`, err.message)
    process.exit(1)
  }
  const files = []
  for (const name of entries.sort()) {
    const dir = join(MIGRATIONS_DIR, name)
    let st
    try {
      st = statSync(dir)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    const sqlPath = join(dir, "migration.sql")
    try {
      const content = readFileSync(sqlPath, "utf8")
      files.push({ name, path: sqlPath, content })
    } catch {
      // migration sem .sql (raro) — ignora.
    }
  }
  return files
}

function sha256(s) {
  return createHash("sha256").update(s).digest("hex")
}

async function ensureTracking(client) {
  // Cria a tabela de tracking. Retorna `true` se acabou de criar (bootstrap).
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${TRACKING_TABLE}" (
      filename   TEXT PRIMARY KEY,
      hash       TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  // pg retorna `command: 'CREATE TABLE'` quando cria de fato, ou nada se já
  // existia. Como CREATE TABLE IF NOT EXISTS sempre retorna 'CREATE TABLE',
  // usamos uma query auxiliar pra detectar "está vazia".
  const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${TRACKING_TABLE}"`)
  return r.rows[0].n === 0
}

async function bootstrap(client, files) {
  // Banco já existia antes deste script existir. Marcamos todas as migrations
  // atuais como "já aplicadas" sem rodá-las (assumindo o schema do prod está
  // sincronizado). Próximas migrations rodam normalmente.
  console.log(
    `[apply-pending] bootstrap: marcando ${files.length} migrations existentes como aplicadas.`,
  )
  for (const file of files) {
    await client.query(
      `INSERT INTO "${TRACKING_TABLE}" (filename, hash, applied_at)
       VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
      [file.name, sha256(file.content)],
    )
  }
}

async function alreadyApplied(client, filename, hash) {
  const r = await client.query(
    `SELECT hash FROM "${TRACKING_TABLE}" WHERE filename = $1`,
    [filename],
  )
  if (r.rowCount === 0) return false
  const existing = r.rows[0].hash
  if (existing !== hash) {
    console.warn(
      `[apply-pending] WARN: ${filename} já aplicada mas com hash diferente.`,
      `Sugere edição pós-aplicação. Não re-aplicando (idempotência manual).`,
    )
  }
  return true
}

async function applyMigration(client, file) {
  console.log(`[apply-pending] aplicando ${file.name}…`)
  // Cada migration roda em transação própria. Se uma migration tiver DDLs
  // que o Postgres não permite em transação (ex: CREATE INDEX CONCURRENTLY),
  // o autor precisa documentar e o script vai dar erro claro.
  await client.query("BEGIN")
  try {
    await client.query(file.content)
    await client.query(
      `INSERT INTO "${TRACKING_TABLE}" (filename, hash) VALUES ($1, $2)
       ON CONFLICT (filename) DO UPDATE SET hash = EXCLUDED.hash`,
      [file.name, sha256(file.content)],
    )
    await client.query("COMMIT")
    console.log(`[apply-pending]   ✓ ${file.name}`)
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw new Error(`Falha em ${file.name}: ${err.message}`)
  }
}

async function main() {
  const files = listMigrationFiles()
  if (files.length === 0) {
    console.log("[apply-pending] nenhuma migration encontrada.")
    return
  }

  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID])
  try {
    const isFreshTable = await ensureTracking(client)

    if (isFreshTable) {
      // Primeira execução do script em um banco que provavelmente já tem o
      // schema. Bootstrapa marcando tudo como aplicado pra evitar quebrar
      // migrations antigas não-idempotentes.
      await bootstrap(client, files)
      console.log(
        "[apply-pending] bootstrap completo. Próximas migrations vão rodar normalmente.",
      )
      return
    }

    let applied = 0
    let skipped = 0
    for (const file of files) {
      const hash = sha256(file.content)
      if (await alreadyApplied(client, file.name, hash)) {
        skipped++
        continue
      }
      await applyMigration(client, file)
      applied++
    }

    console.log(
      `[apply-pending] concluído. ${applied} aplicadas, ${skipped} já existentes.`,
    )
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
    await client.end()
  }
}

main().catch((err) => {
  console.error("[apply-pending] ERRO:", err.message)
  process.exit(1)
})
