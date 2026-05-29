# Issue 068 — Schema: ContactMessage + enriquecimento do Lead

**Tipo:** infra (schema)
**Escopo:** `prisma/schema.prisma` + migration
**Depende de:** 020 (Prisma base)
**Prioridade:** P1

## Contexto

Hoje os formularios de contato/suporte nao tem destino persistente coerente:
- `/contato` (publico) cai em `/api/leads` e vira um registro `Lead` (B2B revenda), misturando duvida geral com funil comercial de revendedores.
- `/api/aluno/suporte` (aluno logado) so dispara email + notificacao, sem gravar nada — some sem historico.
- `Lead` joga `interesse`/`cidade`/`estado` num campo `notes` de texto serializado, impossivel de filtrar.

Decisao de produto: **contato publico** e **suporte do aluno** convergem para uma unica caixa de atendimento por dono (PMB ou unidade), roteada por tenant. **Lead** passa a ser exclusivo de revenda.

## O que fazer

### 1. Novo modelo `ContactMessage` (+ enums)

```prisma
enum ContactMessageKind {
  CONTACT          // visitante (form publico /contato ou storefront)
  STUDENT_SUPPORT  // aluno logado abriu chamado
}

enum ContactMessageStatus {
  OPEN
  RESOLVED
}

model ContactMessage {
  id        String  @id @default(cuid())
  // null = PMB institucional · senao a unidade (tenant) dona da relacao
  tenantId  String? @map("tenant_id")
  tenant    Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  kind      ContactMessageKind
  status    ContactMessageStatus @default(OPEN)

  // Contato (snapshot — nao FK pro Student no caso de visitante anonimo)
  nome      String
  email     String?
  telefone  String?
  assunto   String?
  mensagem  String  @db.Text

  // Preenchido apenas quando kind=STUDENT_SUPPORT
  studentId String?  @map("student_id")
  student   Student? @relation(fields: [studentId], references: [id], onDelete: SetNull)

  // Proveniencia / LGPD
  source    String?  // "/contato", "loja:{slug}", "aluno"
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent") @db.Text

  // Resolucao
  resolvedAt       DateTime? @map("resolved_at")
  resolvedByUserId String?   @map("resolved_by_user_id")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([tenantId, status, createdAt])
  @@index([studentId])
  @@map("contact_messages")
}
```

Adicionar relacoes inversas:
- `Tenant`: `contactMessages ContactMessage[]`
- `Student`: `contactMessages ContactMessage[]`

### 2. Enriquecer `Lead` (revenda)

Adicionar colunas estruturadas (manter `notes` por compatibilidade):
```prisma
  plan  String? // plano de interesse (Profissionaliza / PRO)
  city  String?
  state String? @db.VarChar(4)
  source String? // origem do lead (ex: "/seja-revendedor")
```

### 3. Migration

`npx prisma migrate dev --name contact_message_and_lead_fields` + `npx prisma generate`.

## Criterios de Aceite

- [ ] Modelo `ContactMessage` + enums criados, relacoes inversas em Tenant e Student
- [ ] `Lead` com `plan`/`city`/`state`/`source`
- [ ] Migration aplicada sem erro contra o banco atual
- [ ] `npx prisma generate` verde
- [ ] `npx tsc --noEmit` verde
