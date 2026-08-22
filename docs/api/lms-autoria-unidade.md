# Autoria de curso pela unidade — contrato PMB ↔ LMS

> Complementa `docs/api/lms-webhook-catalogo.md`. Aqui está **o que o LMS
> precisa expor** para que uma unidade (revenda) produza o próprio curso.
>
> **Estado:** implementado do lado do PMB, atrás da flag `LMS_AUTHORING_ENABLED`.
> Aguardando os endpoints do lado do LMS.
> **Data:** 2026-08-21.

---

## 1. Por que existe

O PMB passou a ser um **marketplace de duas pontas**: a unidade produz curso
próprio, escolhe em quais vitrines ele é vendido e define a comissão de quem
vender. O financeiro (cobrança, rateio, comissão, certificado) continua **100%
no PMB** — o LMS entrega **conteúdo**, como já faz.

Hoje o `/api/v1` do LMS é leitura de catálogo + comandos de matrícula. A área de
autoria vive em `/api/autoria`, marcada como interna, e **não existe curso com
dono**. São essas duas lacunas que este documento fecha.

## 2. O princípio que não pode ser quebrado

> **Curso com dono NÃO entra no catálogo global.**

`GET /api/v1/courses` alimenta a vitrine de toda a rede. Se um curso de uma
unidade aparecer ali como curso comum, o PMB o gravaria com `author_tenant_id`
nulo — ou seja, como **curso do catálogo da PMB** — e ele seria distribuído de
graça para todas as vitrines, vendido sem repasse nenhum ao dono.

O alcance de um curso de autoria é decidido no PMB (`Course.distribution`),
nunca no LMS.

## 3. Endpoints a implementar

### 3.1 `POST /api/v1/courses` — criar a casca

Quem cria o curso é o **PMB**, não o LMS: assim a linha em `courses` já nasce
com `author_tenant_id` e `lms_course_id` amarrados. Se a criação partisse do
LMS, o curso chegaria pelo sync e teria que ser adotado por heurística.

```jsonc
// Request
{
  "ownerTenantExternalId": "clx123...",   // Tenant.id do PMB (o mesmo de PUT /tenants/:id)
  "title": "Excel Avançado para Escritório",
  "description": "…",                      // opcional
  "workload": "40 horas"                   // opcional
}

// 201
{ "data": { "id": "uuid", "slug": "excel-avancado-para-escritorio" } }
```

- O curso nasce **rascunho e com dono**. Não aparece em `GET /courses`.
- `400` se `ownerTenantExternalId` não for uma unidade conhecida do LMS
  (registre-a antes com `PUT /api/v1/tenants/:id`, que o PMB já chama).

### 3.2 `PATCH /api/v1/courses/:id` — publicar / despublicar

```jsonc
{ "published": true }
```

Espelha o estado do PMB. Curso **com dono** publicado entra em `GET /courses`
apenas com `ownerTenantExternalId` preenchido (ver §3.4) — quem decide onde ele
é vendido continua sendo o PMB.

### 3.3 `POST /api/v1/sso/author-token` — editar o conteúdo

Link de uso único para a pessoa da unidade entrar na **área de autoria** do LMS.

```jsonc
// Request
{
  "tenantExternalId": "clx123...",
  "courseId": "uuid",
  "returnUrl": "https://profissionalizamaisbrasil.com.br/painel/cursos"
}

// 200
{ "url": "https://lms.bmbr.com.br/autoria/…?t=…" }
```

**Escopo é responsabilidade do LMS:** o token não pode abrir a autoria de curso
de outra unidade nem do catálogo da PMB. O PMB já garante a outra metade —
só emite o token para quem é autor do curso (filtro por `authorTenantId` na
própria query).

### 3.4 `GET /api/v1/courses` — campo novo

Acréscimo **aditivo** ao payload de cada curso:

| Campo | Tipo | Significado |
|---|---|---|
| `ownerTenantExternalId` | `string \| null` | Unidade dona. `null`/ausente = catálogo da PMB (todo o catálogo de hoje) |

O PMB já tolera a ausência do campo. Quando ele chegar preenchido para um curso
que o PMB ainda não conhece, a linha nasce **rascunho e oculta** — nunca no
catálogo da PMB. Se o `ownerTenantExternalId` não casar com nenhuma unidade, o
PMB registra um aviso e mantém o curso fora de todas as vitrines.

O mesmo campo deve viajar em `GET /api/v1/courses/:slug` e no delta
`GET /api/v1/day-update`.

## 4. O que NÃO muda

- Matrícula, SSO do aluno, progresso, bloqueio e branding continuam idênticos.
- Preço, comissão, rateio e certificado **não existem no LMS**. O
  `suggestedPriceCents` de um curso com dono é ignorado pelo PMB: o valor vale é
  o `authorAmount` que a unidade definiu no painel dela.
- O webhook `course.published` / `course.updated` / `course.unpublished`
  continua igual — o PMB re-puxa o catálogo.

## 5. Ligar em produção

1. Implementar §3.1–§3.4 no LMS.
2. Setar `LMS_AUTHORING_ENABLED=true` na Vercel.
3. Conferir numa unidade de teste: criar curso → "Conteúdo" abre a autoria →
   publicar → o curso aparece na vitrine dela.

Enquanto a flag estiver desligada, a unidade monta o curso e os termos
comerciais normalmente, mas ele fica em **rascunho**: publicar sem conteúdo
faria a venda ser cobrada e o provisionamento falhar com o aluno já tendo pago.
