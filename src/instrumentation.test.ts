import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock do logger Pino (usado no branch nodejs de onRequestError).
const errorSpy = vi.fn()
vi.mock("@/lib/logger", () => ({
  logger: { error: errorSpy, info: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
}))

import { onRequestError } from "./instrumentation"

const request = { path: "/api/x", method: "POST" }
const context = {
  routerKind: "App Router",
  routePath: "/api/x",
  routeType: "route",
}

describe("onRequestError", () => {
  const originalRuntime = process.env.NEXT_RUNTIME

  beforeEach(() => {
    errorSpy.mockClear()
  })

  afterEach(() => {
    process.env.NEXT_RUNTIME = originalRuntime
    vi.restoreAllMocks()
  })

  it("no runtime nodejs, loga via Pino com contexto estruturado e sem headers", async () => {
    process.env.NEXT_RUNTIME = "nodejs"
    await onRequestError(new Error("boom"), request, context)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [fields, msg] = errorSpy.mock.calls[0]
    expect(fields).toMatchObject({
      event: "request.unhandled_error",
      path: "/api/x",
      method: "POST",
      routeType: "route",
    })
    expect(fields.err).toBeInstanceOf(Error)
    // Não vaza headers/PII.
    expect(fields).not.toHaveProperty("headers")
    expect(msg).toBe("erro de servidor não tratado")
  })

  it("no runtime edge, usa console.error com JSON Edge-safe (não chama Pino)", async () => {
    process.env.NEXT_RUNTIME = "edge"
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await onRequestError(new Error("edge boom"), request, context)

    expect(errorSpy).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    const line = consoleSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({
      level: "error",
      event: "request.unhandled_error",
      path: "/api/x",
    })
    expect(parsed.err).toMatchObject({ name: "Error", message: "edge boom" })
    expect(parsed).not.toHaveProperty("headers")
  })
})
