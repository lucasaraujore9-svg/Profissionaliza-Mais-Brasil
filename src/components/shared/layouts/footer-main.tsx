import Link from "next/link"
import Image from "next/image"
import { MessageCircle, Mail, Clock, Phone } from "lucide-react"

// lucide-react 1.x nesta versao nao expoe brand icons (Instagram, Facebook,
// YouTube). Usamos SVGs inline simples com aria-label apropriado.
function IconInstagram(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
    </svg>
  )
}
function IconFacebook(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}
function IconYoutube(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  )
}
import { getSocialLinks, getSupportContacts } from "@/lib/branding"
import type { CategoriaInfo } from "@/lib/catalog/home"

interface NavLink {
  label: string
  href: string
}

// Categorias do menu publico vem dinamicas via prop (lidas de loadCategorias
// no layout). Sem fallback hardcoded — se nao houver categorias com cursos
// ativos, a coluna "Cursos por área" simplesmente nao renderiza.
const ALUNO_LINKS: NavLink[] = [
  { label: "Entrar no curso", href: "/login" },
  { label: "Acessar certificado", href: "/certificado" },
  { label: "Como funciona", href: "/como-funciona" },
  { label: "Dúvidas frequentes", href: "/ajuda" },
  { label: "Política de reembolso", href: "/reembolso" },
]

const INSTITUCIONAL_LINKS: NavLink[] = [
  { label: "Quem somos", href: "/sobre" },
  { label: "Contato", href: "/contato" },
  { label: "Termos de uso", href: "/termos" },
  { label: "Política de privacidade", href: "/privacidade" },
  { label: "Seja revendedor", href: "/seja-revendedor" },
]

interface FooterMainProps {
  categorias?: CategoriaInfo[]
  /**
   * Sobrescreve os links de redes sociais. A vitrine do revendedor passa os
   * perfis preenchidos na personalização da vitrine (tenant) em vez dos
   * perfis oficiais da PMB.
   */
  social?: { instagram?: string | null; facebook?: string | null; youtube?: string | null }
  /** Exibe a linha do CNPJ da PMB. A vitrine do revendedor passa `false`. */
  showCnpj?: boolean
}

export function FooterMain({
  categorias = [],
  social: socialOverride,
  showCnpj = true,
}: FooterMainProps) {
  const support = getSupportContacts()
  const social = socialOverride ?? getSocialLinks()
  const categoriaLinks: NavLink[] = categorias.slice(0, 6).map((cat) => ({
    label: cat.nome,
    href: `/cursos?categoria=${cat.slug}`,
  }))
  const showCategoriasColumn = categoriaLinks.length > 0

  return (
    <footer className="bg-[var(--color-pmb-green)] text-white">
      <div className="mx-auto max-w-[1280px] px-4 pt-14 pb-8 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link
              href="/"
              aria-label="Profissionaliza Mais Brasil"
              className="inline-flex items-center rounded-lg bg-white p-2"
            >
              <Image
                src="/images/logo.png"
                alt="Profissionaliza Mais Brasil"
                width={1536}
                height={1024}
                className="h-10 w-auto"
              />
            </Link>

            <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-white/75">
              Cursos profissionalizantes online com certificado reconhecido.
              Aprenda uma profissão e comece a faturar sem sair de casa.
            </p>

            <ul className="mt-5 space-y-2 text-[13px] text-white/80">
              {support.phoneLabel && support.phoneUrl && (
                <li className="flex items-center gap-2">
                  {support.isWhatsapp ? (
                    <MessageCircle
                      className="h-4 w-4 text-[var(--color-pmb-lime)]"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  ) : (
                    <Phone
                      className="h-4 w-4 text-[var(--color-pmb-lime)]"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  )}
                  <a
                    href={support.phoneUrl}
                    target={support.isWhatsapp ? "_blank" : undefined}
                    rel={support.isWhatsapp ? "noopener noreferrer" : undefined}
                    className="hover:underline"
                  >
                    {support.isWhatsapp ? "WhatsApp" : "Atendimento"}{" "}
                    {support.phoneLabel}
                  </a>
                </li>
              )}
              <li className="flex items-center gap-2">
                <Mail
                  className="h-4 w-4 text-[var(--color-pmb-lime)]"
                  strokeWidth={2.25}
                  aria-hidden
                />
                <a
                  href={`mailto:${support.email}`}
                  className="hover:underline"
                >
                  {support.email}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Clock
                  className="h-4 w-4 text-[var(--color-pmb-lime)]"
                  strokeWidth={2.25}
                  aria-hidden
                />
                {support.hours}
              </li>
            </ul>

            {(social.instagram || social.facebook || social.youtube) && (
              <div className="mt-5 flex items-center gap-2">
                {social.instagram && (
                  <a
                    href={social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                  >
                    <IconInstagram className="h-4 w-4" aria-hidden />
                  </a>
                )}
                {social.facebook && (
                  <a
                    href={social.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                  >
                    <IconFacebook className="h-4 w-4" aria-hidden />
                  </a>
                )}
                {social.youtube && (
                  <a
                    href={social.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="YouTube"
                    className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                  >
                    <IconYoutube className="h-4 w-4" aria-hidden />
                  </a>
                )}
              </div>
            )}
          </div>

          {showCategoriasColumn && (
            <FooterColumn
              title="Cursos por área"
              links={[
                ...categoriaLinks,
                { label: "Ver todas as áreas", href: "/cursos" },
              ]}
            />
          )}
          <FooterColumn title="Aluno" links={ALUNO_LINKS} />
          <FooterColumn title="Institucional" links={INSTITUCIONAL_LINKS} />
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-[12px] text-white/60 md:flex-row md:items-center">
          <p>
            © {new Date().getFullYear()} Profissionaliza Mais Brasil · Todos
            os direitos reservados
          </p>
          <p>
            {showCnpj ? "CNPJ 66.553.170/0001-01 · " : ""}Pagamentos 100% seguros
          </p>
        </div>
      </div>
    </footer>
  )
}

interface FooterColumnProps {
  title: string
  links: NavLink[]
}

function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <h3 className="text-[12px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5 text-[13.5px] text-white/80">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="transition-colors hover:text-white hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
