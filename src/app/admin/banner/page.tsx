import { redirect } from "next/navigation"

/**
 * Banner agora vive em /admin/vitrine (junto com toda a personalização do site
 * PMB). Mantemos este redirect para qualquer link salvo.
 */
export default function AdminBannerRedirect() {
  redirect("/admin/vitrine")
}
