import Image from "next/image"
import { shouldUnoptimizeImage } from "@/lib/images"
import {
  Scissors,
  Heart,
  ChefHat,
  Zap,
  Hammer,
  Briefcase,
  PawPrint,
  Monitor,
  Car,
  Shirt,
  Languages,
  TrendingUp,
  Wrench,
  Sparkles as SparklesIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

const CATEGORIA_MAP: Record<string, { icon: LucideIcon; pattern: string }> = {
  Beleza: { icon: Scissors, pattern: "beleza" },
  "Beleza e Estética": { icon: Scissors, pattern: "beleza" },
  Saúde: { icon: Heart, pattern: "saude" },
  "Saúde e Bem-estar": { icon: Heart, pattern: "saude" },
  Gastronomia: { icon: ChefHat, pattern: "gastro" },
  Elétrica: { icon: Zap, pattern: "eletrica" },
  "Eletricista e Hidráulica": { icon: Zap, pattern: "eletrica" },
  Construção: { icon: Hammer, pattern: "construcao" },
  "Construção Civil": { icon: Hammer, pattern: "construcao" },
  Administração: { icon: Briefcase, pattern: "admin" },
  Pet: { icon: PawPrint, pattern: "pet" },
  "Pet e Veterinária": { icon: PawPrint, pattern: "pet" },
  Tecnologia: { icon: Monitor, pattern: "tech" },
  Automotivo: { icon: Car, pattern: "auto" },
  "Moda e Costura": { icon: Shirt, pattern: "moda" },
  Idiomas: { icon: Languages, pattern: "idiomas" },
  Vendas: { icon: TrendingUp, pattern: "vendas" },
  Manutenção: { icon: Wrench, pattern: "manut" },
}

const ACCENT_BG: Record<string, string> = {
  gold: "linear-gradient(135deg, #F2B705 0%, #D9A304 100%)",
  cyan: "linear-gradient(135deg, #07B2D9 0%, #026E8A 100%)",
  lime: "linear-gradient(135deg, #C0D904 0%, #7EA302 100%)",
  green: "linear-gradient(135deg, #025918 0%, #013A0F 100%)",
  terracotta: "linear-gradient(135deg, #8C3A27 0%, #5A2418 100%)",
}

type Accent = keyof typeof ACCENT_BG

interface CourseThumbProps {
  categoria: string
  accent?: Accent
  hours?: string
  imageUrl?: string | null
  titulo?: string
}

export function CourseThumb({
  categoria,
  accent = "gold",
  hours,
  imageUrl,
  titulo,
}: CourseThumbProps) {
  const entry = CATEGORIA_MAP[categoria] ?? { icon: SparklesIcon, pattern: "default" }
  const Icon = entry.icon
  const textColor = accent === "gold" || accent === "lime" ? "#025918" : "#FFFFFF"

  if (imageUrl) {
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-pmb-mist)]">
        <Image
          src={imageUrl}
          alt={titulo ?? categoria}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover"
          unoptimized={shouldUnoptimizeImage(imageUrl)}
        />
        {hours && (
          <div className="absolute bottom-2 right-3 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {hours}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden"
      style={{ background: ACCENT_BG[accent] }}
    >
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.18]"
        aria-hidden
        viewBox="0 0 400 250"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id={`p-${entry.pattern}`} width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1.5" fill={textColor} />
            <path d="M0 20 L40 20 M20 0 L20 40" stroke={textColor} strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="400" height="250" fill={`url(#p-${entry.pattern})`} />
      </svg>

      <div
        aria-hidden
        className="absolute -right-6 -top-6 h-32 w-32 rounded-full"
        style={{ background: textColor, opacity: 0.08 }}
      />
      <div
        aria-hidden
        className="absolute -left-10 bottom-[-30px] h-40 w-40 rounded-full"
        style={{ background: textColor, opacity: 0.06 }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <Icon
          className="h-16 w-16"
          strokeWidth={1.75}
          style={{ color: textColor }}
          aria-hidden
        />
      </div>

      <div
        className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-widest"
        style={{ color: textColor, opacity: 0.85 }}
      >
        {categoria}
      </div>

      {hours && (
        <div
          className="absolute bottom-2 right-3 rounded-md bg-black/20 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm"
        >
          {hours}
        </div>
      )}
    </div>
  )
}
