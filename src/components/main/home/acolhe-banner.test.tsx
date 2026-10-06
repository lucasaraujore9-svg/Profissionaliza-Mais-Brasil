import { existsSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AcolheBanner, ACOLHE_URL } from "./acolhe-banner"

describe("AcolheBanner", () => {
  const html = renderToStaticMarkup(<AcolheBanner />)

  it("leva ao site do Acolhe em nova guia", () => {
    expect(html).toContain(`href="${ACOLHE_URL}"`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it("usa imagens mobile e desktop que existem em public/", () => {
    const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1])
    expect(srcs).toEqual([
      "/images/acolhe/banner-mobile.webp",
      "/images/acolhe/banner-desktop.webp",
    ])
    for (const src of srcs) {
      expect(existsSync(join(process.cwd(), "public", src))).toBe(true)
    }
  })
})
