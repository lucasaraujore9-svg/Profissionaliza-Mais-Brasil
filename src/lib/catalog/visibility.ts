import type { Prisma } from "@prisma/client"

/**
 * Regra de negocio: "nenhum curso SEM VALOR pode ser exibido na vitrine".
 *
 * Um curso PMB "tem valor" quando o preco efetivo e > 0. O preco efetivo segue
 * o mesmo criterio do `pickPrice` (src/lib/catalog/home.ts e course-mapper.ts):
 * `precoVitrineMain ?? precoPromocional ?? precoOriginal`, tomando o primeiro
 * valor positivo. Logo, efetivo > 0  <=>  algum dos tres campos > 0.
 *
 * Use sempre via `AND: [COURSE_HAS_PRICE]` para compor com seguranca junto de
 * um `where` que ja possa ter `OR` (ex.: filtro de busca) — dois `OR` no mesmo
 * objeto se sobrescreveriam.
 *
 * Para a vitrine de REVENDA o preco efetivo e o `TenantCourse.price`, entao o
 * gate la e simplesmente `price: { gt: 0 }` na query de TenantCourse.
 */
export const COURSE_HAS_PRICE: Prisma.CourseWhereInput = {
  OR: [
    { precoVitrineMain: { gt: 0 } },
    { precoPromocional: { gt: 0 } },
    { precoOriginal: { gt: 0 } },
  ],
}
