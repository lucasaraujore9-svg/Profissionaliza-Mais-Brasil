import { describe, it, expect } from "vitest"
// DB-007: utilitário do runner de migrations (scripts/sql-split.mjs). Testado a
// partir de src porque o vitest só inclui src/**/*.test.ts.
import { splitSqlStatements, needsAutocommit } from "../../scripts/sql-split.mjs"

const split = splitSqlStatements as (sql: string) => string[]
const autocommit = needsAutocommit as (sql: string) => boolean

describe("splitSqlStatements", () => {
  it("quebra statements simples por ;", () => {
    expect(split("CREATE INDEX a ON t(x); CREATE INDEX b ON t(y);")).toEqual([
      "CREATE INDEX a ON t(x)",
      "CREATE INDEX b ON t(y)",
    ])
  })

  it("ignora ; dentro de comentário de linha", () => {
    const sql = "CREATE INDEX a ON t(x); -- comentario; com ponto e virgula\nCREATE INDEX b ON t(y);"
    expect(split(sql)).toEqual([
      "CREATE INDEX a ON t(x)",
      "-- comentario; com ponto e virgula\nCREATE INDEX b ON t(y)",
    ])
  })

  it("ignora ; dentro de comentário de bloco", () => {
    const sql = "SELECT 1 /* nao; quebra; aqui */; SELECT 2;"
    expect(split(sql)).toEqual(["SELECT 1 /* nao; quebra; aqui */", "SELECT 2"])
  })

  it("ignora ; dentro de string entre aspas simples (com escape '')", () => {
    const sql = "UPDATE t SET s = 'a;b '' c;d'; SELECT 2;"
    expect(split(sql)).toEqual(["UPDATE t SET s = 'a;b '' c;d'", "SELECT 2"])
  })

  it("ignora ; dentro de bloco dollar-quoted DO $$ ... $$", () => {
    const sql =
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1) THEN raise notice 'x;y'; END IF; END $$; SELECT 2;"
    expect(split(sql)).toEqual([
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1) THEN raise notice 'x;y'; END IF; END $$",
      "SELECT 2",
    ])
  })

  it("suporta dollar-quoting com tag nomeada", () => {
    const sql = "SELECT $tag$ a;b;c $tag$; SELECT 2;"
    expect(split(sql)).toEqual(["SELECT $tag$ a;b;c $tag$", "SELECT 2"])
  })

  it("descarta trechos vazios e faz trim", () => {
    expect(split("  ;\n  SELECT 1 ;  ; ")).toEqual(["SELECT 1"])
  })
})

describe("needsAutocommit", () => {
  it("detecta CREATE INDEX CONCURRENTLY", () => {
    expect(autocommit('CREATE INDEX CONCURRENTLY "x" ON t(y);')).toBe(true)
  })

  it("detecta DROP INDEX CONCURRENTLY (case-insensitive)", () => {
    expect(autocommit("drop index concurrently x;")).toBe(true)
  })

  it("NÃO dispara para CREATE INDEX comum", () => {
    expect(autocommit('CREATE INDEX IF NOT EXISTS "x" ON t(y);')).toBe(false)
  })

  it("NÃO dispara quando CONCURRENTLY só aparece em comentário", () => {
    const sql = "-- sem CONCURRENTLY porque o runner usa transacao\nCREATE INDEX x ON t(y);"
    expect(autocommit(sql)).toBe(false)
  })
})
