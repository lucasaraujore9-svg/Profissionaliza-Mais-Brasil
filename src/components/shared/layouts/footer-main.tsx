import Link from "next/link"
import Image from "next/image"
import { MessageCircle, Mail, MapPin, Camera, Users, PlayCircle } from "lucide-react"

const GRUPOS = [
  {
    titulo: "Cursos por área",
    links: [
      { label: "Beleza e Estética", href: "/categoria/beleza" },
      { label: "Saúde e Bem-estar", href: "/categoria/saude" },
      { label: "Gastronomia", href: "/categoria/gastronomia" },
      { label: "Eletricista e Hidráulica", href: "/categoria/eletrica" },
      { label: "Construção Civil", href: "/categoria/construcao" },
      { label: "Ver todas as áreas", href: "/cursos" },
    ],
  },
  {
    titulo: "Aluno",
    links: [
      { label: "Entrar no curso", href: "/login" },
      { label: "Acessar certificado", href: "/certificado" },
      { label: "Como funciona", href: "/como-funciona" },
      { label: "Dúvidas frequentes", href: "/ajuda" },
      { label: "Política de reembolso", href: "/reembolso" },
    ],
  },
  {
    titulo: "Institucional",
    links: [
      { label: "Quem somos", href: "/sobre" },
      { label: "Contato", href: "/contato" },
      { label: "Termos de uso", href: "/termos" },
      { label: "Política de privacidade", href: "/privacidade" },
      { label: "Seja revendedor", href: "/seja-revendedor" },
    ],
  },
]

export function FooterMain() {
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
              <li className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[var(--color-pmb-lime)]" strokeWidth={2.25} aria-hidden />
                WhatsApp (11) 4000-0000
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[var(--color-pmb-lime)]" strokeWidth={2.25} aria-hidden />
                atendimento@profissionalizamaisbrasil.com.br
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[var(--color-pmb-lime)]" strokeWidth={2.25} aria-hidden />
                Segunda a sábado, 8h às 20h
              </li>
            </ul>

            <div className="mt-5 flex items-center gap-2">
              <a
                href="https://instagram.com"
                aria-label="Instagram"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <Camera className="h-4 w-4" aria-hidden />
              </a>
              <a
                href="https://facebook.com"
                aria-label="Facebook"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <Users className="h-4 w-4" aria-hidden />
              </a>
              <a
                href="https://youtube.com"
                aria-label="YouTube"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <PlayCircle className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>

          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo}>
              <h3 className="text-[12px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
                {grupo.titulo}
              </h3>
              <ul className="mt-4 space-y-2.5 text-[13.5px] text-white/80">
                {grupo.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="transition-colors hover:text-white hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-[12px] text-white/60 md:flex-row md:items-center">
          <p>
            © {new Date().getFullYear()} Profissionaliza Mais Brasil · Todos os direitos reservados
          </p>
          <p>CNPJ 00.000.000/0001-00 · Pagamentos via Mercado Pago</p>
        </div>
      </div>
    </footer>
  )
}
