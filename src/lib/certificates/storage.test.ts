import { describe, expect, it } from "vitest"
import { extractCertificatePath } from "./storage"

// DB-001/LGPD-001: `Certificate.pdfUrl` passou a guardar o PATH puro do objeto
// (sem URL pública com PII). `extractCertificatePath` é o ponto único por onde
// TODOS os read-paths (download aluno/admin/painel + /validar) derivam o path
// para servir via signed URL/stream. Precisa aceitar a forma atual (path puro) E
// as linhas legadas (URL pública), sem regressão.
describe("extractCertificatePath", () => {
  it("retorna null para valores vazios", () => {
    expect(extractCertificatePath(null)).toBeNull()
    expect(extractCertificatePath(undefined)).toBeNull()
    expect(extractCertificatePath("")).toBeNull()
  })

  it("aceita o PATH puro (forma atual)", () => {
    expect(extractCertificatePath("pmb/ckabc123.pdf")).toBe("pmb/ckabc123.pdf")
    expect(extractCertificatePath("tenant_42/ckxyz.pdf")).toBe("tenant_42/ckxyz.pdf")
  })

  it("normaliza barras iniciais acidentais no path puro", () => {
    expect(extractCertificatePath("/pmb/ckabc123.pdf")).toBe("pmb/ckabc123.pdf")
  })

  it("extrai o path de URL pública legada (linhas antigas)", () => {
    const legacy =
      "https://proj.supabase.co/storage/v1/object/public/certificates/pmb/ckabc123.pdf"
    expect(extractCertificatePath(legacy)).toBe("pmb/ckabc123.pdf")
  })

  it("extrai o path de signed URL (e descarta o query token)", () => {
    const signed =
      "https://proj.supabase.co/storage/v1/object/sign/certificates/tenant_1/ck1.pdf?token=abc.def"
    expect(extractCertificatePath(signed)).toBe("tenant_1/ck1.pdf")
  })

  it("retorna null para URL http(s) de origem desconhecida (não infere path)", () => {
    expect(
      extractCertificatePath("https://attacker.example.com/certificates/x.pdf"),
    ).toBeNull()
  })
})
