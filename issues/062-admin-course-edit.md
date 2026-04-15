# Issue 062 — Edicao de Curso na Vitrine Principal PMB

**Tipo:** behavior + UI
**Escopo:** `src/app/admin/catalogo/*` + `src/app/api/admin/catalogo/*` + Prisma + home
**Depende de:** 061
**Prioridade:** P0

## Objetivo

Super Admin PMB gerencia o catalogo da **vitrine principal PMB** (nao do revendedor): define preco, destaque na home, ordem, capa, descricao. Aulas continuam vindo da EA — NAO editaveis.

## Schema

```prisma
model Course {
  // ... existentes
  precoVitrineMain    Decimal?  @map("preco_vitrine_main") @db.Decimal(10, 2)
  destaqueHome        Boolean   @default(false) @map("destaque_home")
  ordemHome           Int?      @map("ordem_home")
  descricaoOverride   String?   @db.Text @map("descricao_override")
  capaOverride        String?   @map("capa_override")
}
```

Sync da EA (src/lib/catalog/*) **nao pode** tocar em: `precoVitrineMain`, `destaqueHome`, `ordemHome`, `descricaoOverride`, `capaOverride`.

## API

- `GET /api/admin/catalogo/[id]` — detalhe (qualquer perfil PMB, read-only pra nao-admin)
- `PATCH /api/admin/catalogo/[id]` — **guard SUPER_ADMIN**
- Zod validando: precoVitrineMain numerico >= 0, destaqueHome bool, ordemHome int, descricaoOverride string, capaOverride URL Supabase, status

## UI

- `admin/catalogo/page.tsx` — botao "Editar" em cada card (so pra SUPER_ADMIN)
- `catalog-edit-drawer.tsx` (Sheet lateral shadcn) com form:
  - Preco vitrine principal (com dica: "Este e o preco usado na vitrine PMB. Revendedores definem o proprio.")
  - Destaque na home (switch) + ordem (numero)
  - Capa override (upload Supabase Storage, bucket ja existente)
  - Descricao override (textarea)
  - Categoria loja (select)
  - Status ATIVO/INATIVO
- Badge "Curadoria admin" nos cards com override ativo

## Home PMB consome DB

- `GET /api/home/showcase` — cursos com `destaqueHome=true` ORDER BY `ordemHome`
- `src/app/(main)/page.tsx` busca via fetch; fallback para `courses-data.ts` se lista vazia
- `showcase-cards.tsx` recebe `courses` como prop

## Criterios de Aceite

- [ ] Admin edita preco/capa/descricao/destaque sem quebrar sync
- [ ] Home PMB exibe cursos curados quando `destaqueHome=true` existir
- [ ] Sync roda sem sobrescrever overrides
- [ ] PMB Sales ve catalogo read-only (sem botao Editar)
- [ ] `npm run build` verde
