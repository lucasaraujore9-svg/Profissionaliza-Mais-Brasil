import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

export const dynamic = "force-static"

export const metadata = {
  title: "Validar certificado",
  description:
    "Verifique a autenticidade de um certificado emitido pela Profissionaliza Mais Brasil.",
}

async function verificar(formData: FormData) {
  "use server"
  const raw = formData.get("code")
  const code =
    typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "") : ""
  if (!code) {
    redirect("/validar")
  }
  redirect(`/validar/${encodeURIComponent(code)}`)
}

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 12.5l2 2 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ValidarIndexPage() {
  return (
    <main className="min-h-screen bg-[var(--color-pmb-mist)]">
      {/* Sem backdrop-blur: gatilho de fantasmas de repaint no Android
          (mesma classe do bug dos badges da vitrine). Fundo solido equivale. */}
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/logo.png"
              alt="Profissionaliza Mais Brasil"
              width={140}
              height={48}
              priority
              className="h-9 w-auto object-contain"
            />
            <span className="sr-only">Profissionaliza Mais Brasil</span>
          </Link>
          <span className="hidden text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-pmb-green-900)]/70 sm:inline">
            Validação de certificado
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-12 sm:py-20">
        <section className="overflow-hidden rounded-3xl border border-emerald-200/70 bg-white shadow-sm">
          <div className="flex items-center gap-4 bg-gradient-to-r from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)] px-6 py-5 text-white sm:px-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
              <ShieldIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                Verificação
              </p>
              <h1 className="font-display text-2xl sm:text-3xl">
                Validar certificado
              </h1>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-base text-gray-700">
              Digite ou cole abaixo o código de validação que aparece no
              rodapé do certificado para confirmar sua autenticidade.
            </p>

            <form action={verificar} className="mt-6 flex flex-col gap-3">
              <label
                htmlFor="code"
                className="text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Código de validação
              </label>
              <input
                id="code"
                name="code"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="Ex.: PMB-2026-ABC123"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-base tracking-wider text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[var(--color-pmb-green)] focus:ring-4 focus:ring-[var(--color-pmb-green)]/10"
              />
              <button
                type="submit"
                className="mt-2 inline-flex items-center justify-center rounded-full bg-[var(--color-pmb-green)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-pmb-green-700)]"
              >
                Verificar autenticidade
              </button>
            </form>

            <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-xs text-gray-600">
              <p>
                <strong className="text-[var(--color-pmb-green-900)]">
                  Dica:
                </strong>{" "}
                você também pode validar diretamente pelo QR code impresso ou
                exibido no PDF do certificado.
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-black/5 bg-white/60">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center text-xs text-gray-500">
          Página oficial de verificação ·{" "}
          <Link
            href="/"
            className="font-semibold text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
          >
            profissionalizamaisbrasil.com.br
          </Link>
        </div>
      </footer>
    </main>
  )
}
