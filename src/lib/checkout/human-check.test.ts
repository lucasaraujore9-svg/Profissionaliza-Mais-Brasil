import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { jar, used } = vi.hoisted(() => {
  const store = new Map<string, string>()
  const jar = {
    store,
    get: (k: string) => (store.has(k) ? { value: store.get(k)! } : undefined),
    set: (k: string, v: string) => void store.set(k, v),
    delete: (k: string) => void store.delete(k),
  }
  return { jar, used: new Set<string>() }
})
vi.mock("next/headers", () => ({ cookies: async () => jar }))
vi.mock("@/lib/redis", () => ({
  redis: {
    set: async (k: string, _v: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && used.has(k)) return null
      used.add(k)
      return "OK"
    },
  },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}))

import { makePass, readPass, requireHuman } from "./human-check"

const fetchMock = vi.fn()
function req(token?: string, host = "loja.livrecursos.com.br") {
  const h = new Headers({ host })
  if (token) h.set("x-recaptcha-token", token)
  return new Request("https://x/api/loja/checkout", { method: "POST", headers: h })
}
function google(body: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }))
}

beforeEach(() => {
  process.env.RECAPTCHA_SECRET_KEY = "secret"
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = "site"
  process.env.NEXTAUTH_SECRET = "s"
  jar.store.clear()
  used.clear()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  delete process.env.RECAPTCHA_SECRET_KEY
  delete process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
})

async function code(r: Response | null) {
  return r ? ((await r.json()) as { code: string }).code : null
}

describe("requireHuman", () => {
  it("desligado sem as duas chaves", async () => {
    delete process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
    expect(await requireHuman(req(), "issue")).toBeNull()
  })

  it("cadastro sem caixinha marcada: 403 CAPTCHA_REQUIRED", async () => {
    expect(await code(await requireHuman(req(), "issue"))).toBe("CAPTCHA_REQUIRED")
  })

  it("token valido no mesmo host passa e emite o passe", async () => {
    google({ success: true, hostname: "loja.livrecursos.com.br" })
    expect(await requireHuman(req("tok"), "issue")).toBeNull()
    expect(jar.store.get("pmb_hc")).toBeTruthy()
  })

  it("token resolvido em OUTRO site e recusado", async () => {
    google({ success: true, hostname: "fazenda-de-captcha.example" })
    expect(await code(await requireHuman(req("tok"), "issue"))).toBe("CAPTCHA_INVALID")
  })

  it("token recusado pelo Google e recusado", async () => {
    google({ success: false, "error-codes": ["timeout-or-duplicate"] })
    expect(await code(await requireHuman(req("tok"), "issue"))).toBe("CAPTCHA_INVALID")
  })

  it("pagamento consome o passe UMA vez; a 2a tentativa pede caixinha nova", async () => {
    jar.set("pmb_hc", makePass())
    expect(await requireHuman(req(), "consume")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await code(await requireHuman(req(), "consume"))).toBe("CAPTCHA_REQUIRED")
  })

  it("passe reaproveitado (cookie copiado) e recusado", async () => {
    const pass = makePass()
    jar.set("pmb_hc", pass)
    await requireHuman(req(), "consume")
    jar.set("pmb_hc", pass)
    expect(await code(await requireHuman(req(), "consume"))).toBe("CAPTCHA_REQUIRED")
  })

  it("cadastro nao aceita passe: so token", async () => {
    jar.set("pmb_hc", makePass())
    expect(await code(await requireHuman(req(), "issue"))).toBe("CAPTCHA_REQUIRED")
  })

  it("Google fora do ar: fail-open", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"))
    expect(await requireHuman(req("tok"), "consume")).toBeNull()
  })
})

describe("passe", () => {
  it("assinatura adulterada ou vencida nao vale", () => {
    const p = makePass(1_000)
    expect(readPass(p, 2_000)).toBeTruthy()
    expect(readPass(p, 1_000 + 121_000)).toBeNull()
    const [n, exp] = p.split(".")
    expect(readPass(`${n}.${Number(exp) + 999999}.${p.split(".")[2]}`, 2_000)).toBeNull()
    expect(readPass("lixo", 2_000)).toBeNull()
  })
})
