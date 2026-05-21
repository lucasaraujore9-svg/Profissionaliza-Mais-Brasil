# Arquitetura — Padrões Técnicos do PMB

Este documento descreve os padrões de arquitetura que TODO o código do Profissionaliza Mais Brasil DEVE seguir.

---

## 1. Cliente Fino / Servidor Gordo

Toda a lógica de negócio vive no servidor. O cliente é apenas apresentação e interatividade.

### Regra: Código no Servidor

- **Server Components** (padrão): Lógica de dados, queries, decisões, processamento
- **Server Actions**: Mutações de dados, webhooks, integrações
- **API Routes**: Integrações externas, webhooks, endpoints públicos

### Regra: Código no Cliente

- **Client Components** (`"use client"`): Apenas quando absolutamente necessário
- Exemplos: `onClick`, `useState`, `useEffect`, modais interativas, formulários com validação em tempo real
- NUNCA fazer query de BD no cliente
- NUNCA expor tokens ou chaves no cliente

### Padrão: Data Fetching

```typescript
// ✅ CORRETO — Server Component
export default async function Dashboard() {
  const tenant = await getCurrentTenant();
  const courses = await prisma.course.findMany({
    where: { tenant_id: tenant.id },
  });
  return <CourseList courses={courses} />;
}

// ✅ CORRETO — Cliente Component dentro de Server Component
"use client";
export function CourseList({ courses }: { courses: Course[] }) {
  const [filter, setFilter] = useState("");
  return (
    <div>
      <input onChange={(e) => setFilter(e.target.value)} />
      {courses.filter(c => c.name.includes(filter)).map(c => (
        <CourseCard key={c.id} course={c} />
      ))}
    </div>
  );
}

// ❌ ERRADO — Client Component fazendo query
"use client";
export function BadComponent() {
  const [courses, setCourses] = useState([]);
  useEffect(() => {
    // ERRADO! Devia ser API Route ou Server Action
    prisma.course.findMany(); // Syntax error mesmo
  }, []);
}
```

---

## 2. Isolamento de Comportamentos

Cada página tem seus próprios arquivos de comportamento para evitar efeitos colaterais.

### Convenção: Nomes de Comportamentos

- `load-X`: Carrega dados (GET)
- `submit-X`: Envia formulário (POST/PUT)
- `toggle-X`: Alterna estado (PUT, state local)
- `delete-X`: Remove item (DELETE)
- `filter-X`: Filtra lista (client-side ou server-side)

### Padrão: Um Comportamento = Um Server Action ou API Route

```typescript
// ✅ CORRETO — Server Action isolado
// src/app/painel/cursos/load-cursos.ts
"use server";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function loadCursos() {
  const tenant = await getCurrentTenant();
  return await prisma.course.findMany({
    where: { tenant_id: tenant.id },
    orderBy: { created_at: "desc" },
  });
}

// Uso em Page Server Component:
// src/app/painel/cursos/page.tsx
import { loadCursos } from "./load-cursos";

export default async function CursosPage() {
  const courses = await loadCursos();
  return <CoursesList courses={courses} />;
}

// ✅ CORRETO — Client Component nunca chama outro comportamento
// Ela envia dados por API, que chama o server action
"use client";
import { submitCourseForm } from "../submit-course-form";

export function CreateCourseForm() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(data: CourseInput) {
    setLoading(true);
    try {
      const result = await submitCourseForm(data);
      // sucesso
    } finally {
      setLoading(false);
    }
  }
  // ...
}
```

### Regra: Comportamentos Nunca Chamam Outros Comportamentos Diretamente

```typescript
// ❌ ERRADO
export async function submitCheckout() {
  const tenant = await getTenant(); // OK
  const orders = await loadOrders(); // ERRADO! Chamando outro behavior
}

// ✅ CORRETO
export async function submitCheckout() {
  const tenant = await getTenant(); // OK, helper
  const orders = await prisma.order.findMany({ /* ... */ }); // OK, direto no BD
}
```

---

## 3. Segurança Multi-Tenant

Este é o padrão MAIS CRÍTICO do sistema.

### Regra Ouro: TODA Query em Contexto de Vitrine/Painel DEVE Incluir `WHERE tenant_id = X`

```typescript
// ✅ CORRETO
const courses = await prisma.course.findMany({
  where: {
    tenant_id: currentTenant.id, // OBRIGATÓRIO
    active: true,
  },
});

// ❌ ERRADO — Sem filtro de tenant
const courses = await prisma.course.findMany({
  where: { active: true }, // Pega cursos de TODOS os tenants!
});

// ❌ ERRADO — Confiando em variável de cliente
const tenantId = req.query.tenant_id; // Pode ser manipulada
const courses = await prisma.course.findMany({
  where: { tenant_id: tenantId },
});
// CORRETO:
const tenantId = getCurrentTenantId(); // Vem do middleware/sessão
```

### Fluxo: Resolução de Tenant (Middleware)

O Next.js middleware resolve o tenant a partir do hostname:

```
1. profissionalizamaisbrasil.com.br
   → /admin, /(main) — contexto ADMIN/GLOBAL
   → Sem filtro de tenant, acesso total

2. revendedor.profissionalizamaisbrasil.com.br
   → /painel, /loja — contexto REVENDEDOR
   → Sempre filtra por tenant_id do subdomain
   → Rewrite para /loja/* (transparente para o app)

3. dominio-custom.com.br (exemplo: meialoja.com.br)
   → /loja — contexto REVENDEDOR
   → Lookup em Redis (cache) ou Supabase (fallback)
   → Sempre filtra por tenant_id do domínio custom
   → Rewrite para /loja/*
```

**Implementação detalhada:** `docs/architecture/DOMINIOS-GUIDE.md`

### Implementação: Middleware no Edge Runtime

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // Domínio principal
  if (hostname.includes("profissionalizamaisbrasil.com.br")) {
    return NextResponse.next();
  }

  // Subdomain customizado ou domínio custom
  const redis = getRedisClient();
  let tenant = null;

  // Tentar cache Redis
  tenant = await redis.get(`tenant:${hostname}`);

  // Fallback: Supabase REST (funciona no Edge)
  if (!tenant) {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/tenants?domain=eq.${hostname}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          "apikey": process.env.SUPABASE_KEY!,
        },
      }
    );
    if (res.ok) {
      const [data] = await res.json();
      tenant = data;
      // Cache por 5 minutos
      await redis.set(`tenant:${hostname}`, tenant, { ex: 300 });
    }
  }

  if (!tenant) {
    return NextResponse.redirect(new URL("/not-found", request.url));
  }

  // Rewrite para /loja e passa tenant no header
  const url = request.nextUrl.clone();
  url.pathname = `/loja${pathname}`;
  const response = NextResponse.rewrite(url);
  response.headers.set("x-tenant-id", tenant.id);
  response.headers.set("x-tenant-slug", tenant.slug);
  return response;
}

export const config = {
  matcher: [
    // Tudo exceto domínio principal e rotas internas
    "/((?!_next|\.well-known|favicon).*)",
  ],
};
```

### Auxiliar: getCurrentTenant()

```typescript
// src/lib/tenant/get-current-tenant.ts
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { cache } from "react";

// Cachear per-request
export const getCurrentTenant = cache(async () => {
  const headersList = await headers();
  const tenantId = headersList.get("x-tenant-id");
  const tenantSlug = headersList.get("x-tenant-slug");

  if (!tenantId) {
    // Contexto admin/main — sem tenant
    return null;
  }

  // Validar que tenant existe e está ativo
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  return tenant;
});

export const getCurrentTenantId = cache(async () => {
  const tenant = await getCurrentTenant();
  return tenant?.id;
});
```

### Reserva de Subdomínios

Os seguintes subdomínios NÃO podem ser usados por revendedores:

```
www, app, api, admin, painel, mail, smtp, ftp, cdn, assets, static, staging, dev, test
```

### Verificação: Cross-Tenant Access

```typescript
// ❌ NUNCA permitir acesso cross-tenant
async function getCourseById(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    // SEM filtro de tenant — RISCO!
  });
  return course;
}

// ✅ SEMPRE validar tenant
async function getCourseById(courseId: string) {
  const currentTenant = await getCurrentTenant();
  const course = await prisma.course.findUnique({
    where: {
      id: courseId,
      tenant_id: currentTenant.id, // OBRIGATÓRIO
    },
  });

  if (!course) {
    throw new Error("Course not found or access denied");
  }
  return course;
}
```

---

## 4. Estrutura de Pastas

```
src/
├── app/
│   ├── (auth)/                    # Login, register, forgot-password
│   │   ├── login/
│   │   ├── register/
│   │   └── forgot-password/
│   │
│   ├── (main)/                    # Site principal PMB (público)
│   │   ├── page.tsx               # Landing
│   │   ├── seja-revendedor/       # Onboarding revendedor
│   │   ├── pricing/
│   │   └── faq/
│   │
│   ├── admin/                     # Painel admin master (ADMIN role only)
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── tenants/
│   │   ├── users/
│   │   ├── billing/
│   │   ├── analytics/
│   │   └── api-keys/
│   │
│   ├── painel/                    # Painel revendedor (RESELLER role)
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── cursos/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   ├── load-cursos.ts
│   │   │   ├── submit-course-form.ts
│   │   │   └── delete-course.ts
│   │   ├── configuracoes/
│   │   │   ├── page.tsx
│   │   │   ├── submit-settings.ts
│   │   │   └── connect-mercadopago.ts
│   │   ├── alunos/
│   │   ├── pedidos/
│   │   └── financeiro/
│   │
│   ├── loja/                      # Vitrine multi-tenant (público, tenant-scoped)
│   │   ├── page.tsx               # Home da loja
│   │   ├── cursos/
│   │   │   ├── page.tsx           # Lista de cursos
│   │   │   ├── [slug]/
│   │   │   │   └── page.tsx       # Detalhe do curso
│   │   │   └── load-courses.ts
│   │   ├── checkout/
│   │   ├── [...slug]/             # Catch-all para páginas customizadas
│   │   └── load-loja-config.ts
│   │
│   └── api/                       # API Routes + Webhooks
│       ├── auth/
│       │   └── [auth]/
│       ├── painel/
│       │   └── [...paths]
│       ├── loja/
│       │   ├── cursos/
│       │   ├── checkout/
│       │   └── carrinho/
│       ├── webhooks/
│       │   ├── mercado-pago/      # POST /api/webhooks/mercado-pago
│       │   ├── asaas/             # POST /api/webhooks/asaas
│       │   └── plataforma-cursos/   # POST /api/webhooks/plataforma-cursos
│       └── integrations/
│           ├── mercado-pago/      # PUT /api/integrations/mercado-pago/connect
│           ├── asaas/
│           └── plataforma-cursos/
│
├── components/
│   ├── ui/                        # shadcn/ui base
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   ├── table.tsx
│   │   └── [...]
│   │
│   ├── admin/                     # Admin-specific
│   │   ├── tenant-card.tsx
│   │   ├── billing-chart.tsx
│   │   ├── users-table.tsx
│   │   └── [...]
│   │
│   ├── painel/                    # Revendedor-specific
│   │   ├── sidebar.tsx
│   │   ├── course-form.tsx
│   │   ├── orders-table.tsx
│   │   ├── settings-form.tsx
│   │   └── [...]
│   │
│   ├── loja/                      # Vitrine-specific
│   │   ├── navbar.tsx
│   │   ├── hero.tsx
│   │   ├── course-card.tsx
│   │   ├── checkout-form.tsx
│   │   └── [...]
│   │
│   └── shared/                    # Cross-context
│       ├── loading-skeleton.tsx
│       ├── error-boundary.tsx
│       ├── breadcrumb.tsx
│       └── [...]
│
├── lib/
│   ├── prisma.ts                  # Prisma client singleton
│   ├── redis.ts                   # Upstash Redis client
│   ├── auth.ts                    # NextAuth.js config
│   ├── crypto.ts                  # AES-256-GCM para tokens MP
│   ├── utils.ts                   # Helpers gerais
│   ├── validations.ts             # Zod schemas reutilizáveis
│   │
│   ├── tenant/
│   │   ├── get-current-tenant.ts
│   │   └── validate-tenant-access.ts
│   │
│   ├── plataforma-cursos/
│   │   ├── client.ts              # form-data client
│   │   ├── types.ts
│   │   ├── usuarios.ts
│   │   ├── cursos.ts
│   │   └── funcionarios.ts
│   │
│   ├── asaas/
│   │   ├── client.ts
│   │   ├── types.ts
│   │   ├── customers.ts
│   │   ├── subscriptions.ts
│   │   └── webhooks.ts
│   │
│   ├── mercadopago/
│   │   ├── client.ts
│   │   ├── types.ts
│   │   ├── payments.ts
│   │   ├── preferences.ts
│   │   └── webhooks.ts
│   │
│   └── vercel/
│       ├── custom-domain.ts       # Vercel API para dominios custom
│       └── types.ts
│
├── hooks/
│   ├── use-tenant.ts              # Hook para acessar tenant
│   ├── use-auth.ts                # Hook para acessar user/session
│   └── [...]
│
├── stores/
│   ├── auth-store.ts              # Zustand (session, user)
│   ├── cart-store.ts              # Zustand (itens do carrinho)
│   └── ui-store.ts                # Zustand (UI state)
│
├── types/
│   ├── index.ts                   # Tipos principais
│   ├── entities.ts                # Types gerados do Prisma
│   ├── api-responses.ts
│   └── forms.ts
│
└── middleware.ts                  # MIDDLEWARE MULTI-TENANT
```

---

## 5. Padrões de API Routes

### Validação com Zod

```typescript
// ✅ CORRETO
import { z } from "zod";

const CreateCourseInput = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  price: z.number().positive(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = CreateCourseInput.parse(body);

    const tenant = await getCurrentTenant();
    const course = await prisma.course.create({
      data: {
        ...input,
        tenant_id: tenant.id,
      },
    });

    return Response.json({ data: course });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### Response Padrão

```typescript
// Sucesso
{ data: T }

// Erro
{ error: string, code?: string, details?: any }

// Exemplos:
{ data: { id: "123", name: "Curso A" } }
{ error: "Validation error", code: "INVALID_INPUT", details: [...] }
{ error: "Course not found", code: "NOT_FOUND" }
{ error: "Unauthorized", code: "FORBIDDEN" }
```

### Webhooks

```typescript
// ✅ CORRETO
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();

  // Log tudo
  await prisma.webhook_log.create({
    data: {
      event_type: "mp_payment",
      payload: body,
      status: "received",
      received_at: new Date(),
    },
  });

  try {
    // Validar assinatura
    const isValid = await validateMercadoPagoSignature(request, body);
    if (!isValid) {
      throw new Error("Invalid signature");
    }

    // Retornar 200 IMEDIATAMENTE
    // (processamento segue async)
    const response = Response.json({ ok: true });

    // Processar async em background (não bloqueia a resposta)
    processPayment(body).catch((error) => {
      console.error("Payment processing error:", error);
      // Notificar, retry, etc
    });

    return response;
  } catch (error) {
    // Log erro
    await prisma.webhook_log.update({
      where: { id: logId },
      data: { status: "error", error_message: String(error) },
    });

    // Retornar 200 mesmo assim (para Mercado Pago não retentar)
    return Response.json({ ok: false });
  }
}
```

### Criptografia de Tokens Mercado Pago

```typescript
// src/lib/crypto.ts
import crypto from "crypto";

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

export function decryptToken(encrypted: string): string {
  const [ivHex, cipherHex, authTagHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// Uso:
// Salvando no BD
const encrypted = encryptToken(mpAccessToken);
await prisma.tenant.update({
  where: { id: tenantId },
  data: { mp_access_token: encrypted },
});

// Usando no server
const encrypted = tenant.mp_access_token;
const token = decryptToken(encrypted);
// Usar token em chamadas MP
```

---

## 6. Convenções de Nomenclatura

| Tipo | Convenção | Exemplo |
|------|-----------|---------|
| **Componentes React** | PascalCase, um por arquivo | `CourseCard.tsx`, `CheckoutForm.tsx` |
| **API Routes** | kebab-case em pastas | `/api/painel/create-course` |
| **Server Actions** | camelCase com verbo | `loadDashboard`, `submitCheckout`, `deleteCourse` |
| **Types** | PascalCase com sufixo | `CreateCourseInput`, `PaymentWithStudent` |
| **Variáveis/Funções** | camelCase | `currentTenant`, `formatPrice()` |
| **Constantes** | UPPER_SNAKE_CASE | `MAX_UPLOAD_SIZE`, `CACHE_TTL` |
| **Ficheiros** | kebab-case | `load-courses.ts`, `submit-form.ts` |
| **Pastas** | kebab-case | `src/app/admin`, `src/lib/plataforma-cursos` |

---

## 7. Tratamento de Erros

```typescript
// ✅ CORRETO
export async function submitCheckout(data: CheckoutInput) {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) {
      throw new Error("Tenant context required");
    }

    const order = await prisma.order.create({
      data: { ...data, tenant_id: tenant.id },
    });

    return { success: true, order };
  } catch (error) {
    console.error("Checkout error:", error);

    // Nunca swallow errors sem logging
    if (error instanceof PrismaClientKnownRequestError) {
      return { error: "Database error", code: "DB_ERROR" };
    }

    if (error instanceof ValidationError) {
      return { error: error.message, code: "VALIDATION_ERROR" };
    }

    return { error: "Unknown error", code: "UNKNOWN_ERROR" };
  }
}

// ❌ ERRADO
async function submitCheckout(data: CheckoutInput) {
  try {
    const order = await prisma.order.create({ data });
    return order;
  } catch (error) {
    // Silenciando erro
    return null;
  }
}
```

---

## 8. Testing & Quality Checklist

- [ ] TypeScript strict mode habilitado
- [ ] Nenhuma query sem `tenant_id` em contextos tenant-scoped
- [ ] Zod validation em TODA API input
- [ ] Nenhum token exposto ao cliente
- [ ] MP access_token criptografado no BD
- [ ] Webhooks: log + async processing + 200 imediato
- [ ] Responsive design: mobile first, testado
- [ ] Loading e error states em todas as páginas
- [ ] Comportamentos isolados: um arquivo por ação

---

## Resumo

A arquitetura PMB segue:

1. **Servidor gordo** — Toda lógica no servidor (SCs, SAs, API)
2. **Cliente fino** — Apenas UI, forms, interatividade
3. **Comportamentos isolados** — Um arquivo por ação
4. **Multi-tenant seguro** — SEMPRE incluir tenant_id
5. **Padrões consistentes** — API responses, nomes, estrutura
6. **Erros tratados** — Nunca swallow, sempre logar

Consulte este documento ao iniciar qualquer tarefa de desenvolvimento.
