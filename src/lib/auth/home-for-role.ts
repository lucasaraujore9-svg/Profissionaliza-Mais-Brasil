import type { UserRole } from "@prisma/client"

export function homeForRole(role?: UserRole | string | null): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "PMB_SALES":
    case "PMB_SALES_MGR":
    case "PMB_REVENDA_SALES":
    case "PMB_RESELLER_MGR":
    case "PMB_FINANCEIRO":
      return "/admin"
    case "RESELLER":
      return "/painel"
    case "STUDENT":
      return "/aluno"
    default:
      return "/"
  }
}
