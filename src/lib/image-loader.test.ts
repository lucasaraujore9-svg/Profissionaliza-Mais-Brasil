import { describe, expect, it } from "vitest"
import pmbImageLoader from "./image-loader"
import { isProxyableImageUrl } from "./images"

describe("isProxyableImageUrl", () => {
  it("aceita hosts da allowlist em https", () => {
    expect(isProxyableImageUrl("https://jpwskehhnplmmtgyyxmf.supabase.co/storage/v1/object/public/x.png")).toBe(true)
    expect(isProxyableImageUrl("https://playcurso.com/bolsamaisbrasil/metodo/imagemcursos/96.jpg")).toBe(true)
    expect(isProxyableImageUrl("https://s3.bmbr.com.br/covers/abc.jpg")).toBe(true)
    expect(isProxyableImageUrl("https://img.youtube.com/vi/abc/hqdefault.jpg")).toBe(true)
  })

  it("rejeita hosts fora da allowlist (anti open-proxy/SSRF)", () => {
    expect(isProxyableImageUrl("https://evil.com/x.jpg")).toBe(false)
    // sufixo parecido nao basta — precisa ser subdominio real de supabase.co
    expect(isProxyableImageUrl("https://fakesupabase.co.attacker.com/x.jpg")).toBe(false)
    expect(isProxyableImageUrl("https://notplaycurso.com/x.jpg")).toBe(false)
  })

  it("rejeita http, credenciais embutidas e URLs nao-absolutas", () => {
    expect(isProxyableImageUrl("http://playcurso.com/x.jpg")).toBe(false)
    expect(isProxyableImageUrl("https://user:pass@playcurso.com/x.jpg")).toBe(false)
    expect(isProxyableImageUrl("/images/logo.png")).toBe(false)
    expect(isProxyableImageUrl("data:image/png;base64,AAAA")).toBe(false)
    expect(isProxyableImageUrl("blob:https://app/abc")).toBe(false)
    expect(isProxyableImageUrl(null)).toBe(false)
    expect(isProxyableImageUrl(undefined)).toBe(false)
  })

  it("deixa SVG e GIF passarem direto (nao redimensiona)", () => {
    expect(isProxyableImageUrl("https://playcurso.com/logo.svg")).toBe(false)
    expect(isProxyableImageUrl("https://playcurso.com/anim.gif")).toBe(false)
    // extensao e avaliada no pathname, nao na query
    expect(isProxyableImageUrl("https://playcurso.com/capa.jpg?ref=x.svg")).toBe(true)
  })
})

describe("pmbImageLoader", () => {
  it("roteia imagem da allowlist pelo proxy com url/w/q", () => {
    const src = "https://playcurso.com/bolsamaisbrasil/metodo/imagemcursos/96.jpg"
    expect(pmbImageLoader({ src, width: 640, quality: 75 })).toBe(
      `/api/img?url=${encodeURIComponent(src)}&w=640&q=75`,
    )
  })

  it("usa qualidade padrao 70 quando o componente nao define", () => {
    const src = "https://s3.bmbr.com.br/covers/abc.jpg"
    expect(pmbImageLoader({ src, width: 384 })).toBe(`/api/img?url=${encodeURIComponent(src)}&w=384&q=70`)
  })

  it("devolve o src intacto fora da allowlist (fallback = unoptimized)", () => {
    expect(pmbImageLoader({ src: "/images/logo.png", width: 640 })).toBe("/images/logo.png")
    expect(pmbImageLoader({ src: "https://evil.com/x.jpg", width: 640 })).toBe("https://evil.com/x.jpg")
    expect(pmbImageLoader({ src: "data:image/png;base64,AAAA", width: 64 })).toBe("data:image/png;base64,AAAA")
  })
})
