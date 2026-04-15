import type { UserRole } from "@prisma/client"

export function homeForRole(role?: UserRole | string | null): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "PMB_SALES":
    case "PMB_RESELLER_MGR":
      return "/admin"
    case "RESELLER":
      return "/painel"
    default:
      return "/"
  }
}
