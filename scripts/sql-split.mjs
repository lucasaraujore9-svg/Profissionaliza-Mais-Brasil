/**
 * Utilitários de SQL para o runner de migrations (apply-pending-migrations.mjs).
 *
 * DB-007: o runner envolve cada arquivo inteiro em UMA transação. Isso quebra
 * statements que o Postgres PROÍBE dentro de bloco transacional — em especial
 * `CREATE INDEX CONCURRENTLY` ("cannot run inside a transaction block"). Um
 * multi-statement enviado como uma só query no protocolo simples também roda
 * numa transação implícita, então nem separar em `;` no mesmo `query()` resolve.
 *
 * Estas funções permitem detectar esses arquivos e executá-los statement a
 * statement em AUTOCOMMIT (sem BEGIN/COMMIT).
 */

/**
 * Quebra um script SQL em statements individuais, respeitando:
 *  - comentários de linha `-- ...`
 *  - comentários de bloco `/* ... *\/`
 *  - strings entre aspas simples `'...'` (com escape `''`)
 *  - dollar-quoting `$tag$ ... $tag$` (corpo de função, DO $$ ... $$)
 *
 * Split apenas em `;` de nível superior. Retorna statements não-vazios (trim).
 *
 * @param {string} sql
 * @returns {string[]}
 */
export function splitSqlStatements(sql) {
  const statements = []
  let current = ""
  let i = 0
  const n = sql.length

  while (i < n) {
    const ch = sql[i]
    const next = i + 1 < n ? sql[i + 1] : ""

    // Comentário de linha
    if (ch === "-" && next === "-") {
      let j = i + 2
      while (j < n && sql[j] !== "\n") j++
      current += sql.slice(i, j)
      i = j
      continue
    }

    // Comentário de bloco
    if (ch === "/" && next === "*") {
      let j = i + 2
      while (j < n && !(sql[j] === "*" && sql[j + 1] === "/")) j++
      j = Math.min(j + 2, n)
      current += sql.slice(i, j)
      i = j
      continue
    }

    // String entre aspas simples
    if (ch === "'") {
      let j = i + 1
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2
          continue
        }
        if (sql[j] === "'") break
        j++
      }
      j = Math.min(j + 1, n)
      current += sql.slice(i, j)
      i = j
      continue
    }

    // Dollar-quoting: $tag$ ... $tag$ (tag pode ser vazia: $$)
    if (ch === "$") {
      const tagMatch = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))
      if (tagMatch) {
        const tag = tagMatch[0]
        const end = sql.indexOf(tag, i + tag.length)
        const j = end === -1 ? n : end + tag.length
        current += sql.slice(i, j)
        i = j
        continue
      }
    }

    // Separador de statement
    if (ch === ";") {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ""
      i++
      continue
    }

    current += ch
    i++
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

/** Remove comentários (linha e bloco) para inspeção de conteúdo "real". */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")
}

/**
 * `true` se o arquivo contém statements que NÃO podem rodar dentro de uma
 * transação (hoje: `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`).
 * Ignora ocorrências dentro de comentários.
 *
 * @param {string} sql
 * @returns {boolean}
 */
export function needsAutocommit(sql) {
  return /\bCONCURRENTLY\b/i.test(stripComments(sql))
}
