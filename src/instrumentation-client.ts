import { initBotId } from "botid/client/core"

// Vercel BotID: anexa a prova de navegador aos POSTs dos checkouts publicos.
// Cada path daqui tem de chamar `rejectBot()` no servidor (lib/checkout/bot-guard.ts)
// — e vice-versa: rota que confere sem estar listada aqui recusa todo comprador.
// O teste `checkout/bot-guard-coverage.test.ts` amarra as duas listas.
const BOTID_PROTECTED_PATHS = [
  "/api/loja/checkout",
  "/api/loja/checkout/*",
  "/api/checkout",
  "/api/checkout/*",
] as const

initBotId({
  protect: BOTID_PROTECTED_PATHS.map((path) => ({ path, method: "POST" })),
})
