// Nome e opcoes do cookie de sessao do NextAuth, centralizados para serem
// reusados tanto na config do Auth.js (src/lib/auth.ts) quanto na emissao
// manual de sessao do handoff cross-domain (src/lib/auth/handoff.ts).
//
// IMPORTANTE: o `salt` do encode/decode do Auth.js v5 É o nome do cookie. Se
// estes valores divergirem do que o NextAuth usa, o cookie emitido pelo
// handoff nao sera aceito (sessao "fantasma"). Mantenha como fonte unica.

const isProd = process.env.NODE_ENV === "production"

export const SESSION_COOKIE_NAME = isProd
  ? "__Secure-authjs.session-token"
  : "authjs.session-token"

// Espelha o default de session.maxAge do NextAuth (30 dias).
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60

// Opcoes do cookie de sessao — espelham o hardening em src/lib/auth.ts.
// `maxAge` incluso para que o browser persista o cookie emitido no handoff.
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: isProd,
  maxAge: SESSION_MAX_AGE,
}
