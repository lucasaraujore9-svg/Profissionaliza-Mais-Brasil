// Roda SQL no projeto via Supabase Management API.
// Token: SUPABASE_ACCESS_TOKEN (em .env.local). Uso:
//   node --env-file=.env.local scripts/pmb-supa.mjs "<SQL inline | caminho .sql>"
// Util quando DATABASE_URL nao esta disponivel localmente (ver memoria
// reference_supabase_sql_via_management_api).
const REF = "jpwskehhnplmmtgyyxmf"
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) { console.error("SUPABASE_ACCESS_TOKEN ausente"); process.exit(1) }

import { readFileSync, existsSync } from "node:fs"
const arg = process.argv[2]
if (!arg) { console.error("passe SQL inline ou caminho de arquivo .sql"); process.exit(1) }
const query = existsSync(arg) ? readFileSync(arg, "utf8") : arg

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
})
const text = await res.text()
if (!res.ok) { console.error("HTTP", res.status, text); process.exit(1) }
console.log(text)
