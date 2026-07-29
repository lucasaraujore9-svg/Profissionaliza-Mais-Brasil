import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { ACCOUNT_MANAGER_ROLES } from "@/lib/auth/roles"

// GET /api/admin/revendedores/gerentes — opções do seletor "atribuir gerente
// de conta" (id + nome, nada mais).
//
// Existe porque a tela lia essa lista de /api/admin/equipe, que exige
// `equipe.manage` — ou seja, na prática só o super admin. Quem tem
// `unidades.governanca` mas não gere a equipe (o Diretor de unidades) via o
// seletor vazio e não conseguia atribuir ninguém. Least-privilege: esta rota
// devolve só o necessário para o seletor, sob a permissão que já autoriza a
// atribuição (o PATCH .../manager revalida).
export const GET = withRequestContext(
  {
    action: "admin.revendedores.gerentes.list",
    route: "/api/admin/revendedores/gerentes",
  },
  async () => {
    const guard = await requireAdmin("unidades.governanca")
    if (!guard.ok) return guard.response

    const managers = await prisma.user.findMany({
      where: {
        role: { in: [...ACCOUNT_MANAGER_ROLES] },
        status: "ATIVO",
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({ data: managers })
  },
)
