import { describe, it, expect } from "vitest"
import type { Metadata } from "next"
import { tenantVitrineMetadata } from "./tenant-metadata"
import type { CurrentTenant } from "@/lib/tenant/current"

// Só os campos que a função lê; o resto do CurrentTenant não influencia icons.
function tenantWith(
  overrides: Partial<CurrentTenant>,
): CurrentTenant {
  return {
    id: "t1",
    slug: "revenda1",
    name: "Revenda 1",
    status: "ACTIVE",
    logoUrl: null,
    faviconUrl: null,
    bannerUrl: null,
    primaryColor: "#025918",
    secondaryColor: "#014712",
    tagline: null,
    description: null,
    whatsapp: null,
    whatsappFloatEnabled: false,
    whatsappFloatSide: "right",
    whatsappFloatMessage: null,
    instagram: null,
    facebook: null,
    youtube: null,
    tiktok: null,
    supportEmail: null,
    supportHours: null,
    referralCode: null,
    tecnicaEnabled: false,
    tecnicaUrl: null,
    tecnicaLabel: null,
    tecnicaCourses: null,
    ejaEnabled: false,
    ejaUrl: null,
    ejaLabel: null,
    automationEnabled: false,
    ...overrides,
  }
}

// `icons` é declarado como Metadata["icons"], um union amplo; nos casos aqui a
// função sempre devolve a forma { icon: [...] }.
function iconUrls(metadata: Metadata): string[] {
  const icons = metadata.icons as { icon?: { url: string }[] } | undefined
  return (icons?.icon ?? []).map((entry) => entry.url)
}

function appleUrls(metadata: Metadata): string[] {
  const icons = metadata.icons as { apple?: { url: string }[] } | undefined
  return (icons?.apple ?? []).map((entry) => entry.url)
}

describe("tenantVitrineMetadata — favicon da unidade", () => {
  it("usa a favicon própria quando a unidade enviou uma", () => {
    const metadata = tenantVitrineMetadata(
      tenantWith({
        logoUrl: "https://cdn.test/logo.png",
        faviconUrl: "https://cdn.test/favicon.png",
      }),
      null,
    )

    expect(iconUrls(metadata)).toEqual(["https://cdn.test/favicon.png"])
    expect(appleUrls(metadata)).toEqual(["https://cdn.test/favicon.png"])
  })

  it("cai na logo quando não há favicon própria (comportamento histórico)", () => {
    const metadata = tenantVitrineMetadata(
      tenantWith({ logoUrl: "https://cdn.test/logo.png" }),
      null,
    )

    expect(iconUrls(metadata)).toEqual(["https://cdn.test/logo.png"])
  })

  it("sem logo e sem favicon, devolve lista vazia para não herdar a favicon da PMB", () => {
    const metadata = tenantVitrineMetadata(tenantWith({}), null)

    expect(iconUrls(metadata)).toEqual([])
  })

  it("tolera entrada antiga do cache de branding, sem a chave faviconUrl", () => {
    // O cache de branding no Redis guarda o CurrentTenant serializado; entradas
    // gravadas antes do campo existir chegam aqui com faviconUrl === undefined.
    const cached = tenantWith({
      logoUrl: "https://cdn.test/logo.png",
    }) as unknown as Record<string, unknown>
    delete cached.faviconUrl

    const metadata = tenantVitrineMetadata(cached as unknown as CurrentTenant, null)

    expect(iconUrls(metadata)).toEqual(["https://cdn.test/logo.png"])
  })

  it("não usa a favicon como imagem de preview — og:image segue banner/logo", () => {
    const metadata = tenantVitrineMetadata(
      tenantWith({
        logoUrl: "https://cdn.test/logo.png",
        bannerUrl: "https://cdn.test/banner.png",
        faviconUrl: "https://cdn.test/favicon.png",
      }),
      null,
    )

    expect(metadata.openGraph?.images).toEqual([
      { url: "https://cdn.test/banner.png", alt: "Revenda 1" },
    ])
  })
})
