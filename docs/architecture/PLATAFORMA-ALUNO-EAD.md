# Plataforma do Aluno EAD Própria — Especificação & Plano

> **Objetivo:** substituir a dependência da plataforma parceira (EA) por uma plataforma
> pedagógica de cursos livres **própria**, reutilizando o design system atual, focada no
> **usuário leigo**, simples, e integrada à estrutura multi-tenant existente.
>
> Status: especificação inicial (planejamento). Documento vivo.
> Data: 2026-06-10.
>
> **Decisões travadas (2026-06-10):**
> 1. **Vídeo:** auto-hospedagem em **MinIO (S3-compatível)** — ver §6 para o pipeline e os trade-offs.
> 2. **Autoria:** conteúdo **global, produzido pela PMB** (revendedores só revendem) — modelo atual mantido.
> 3. **MVP inclui quiz/avaliação** (com nota de corte), além de player + material + progresso + certificado.
> 4. **Migração:** alunos já matriculados num curso migrado **começam do zero**, com aviso amigável.
>
> Escopo deste documento: é o **material/blueprint para construir a plataforma** — não há código sendo
> escrito ainda. Serve para executar a build depois (por dev ou via `/plan` + `/execute`).

---

## 0. Contexto — o que já existe x o que falta

Hoje o sistema é **vitrine + checkout + CRM de alunos + orquestrador de acesso + certificador**.
Toda a **pedagogia** (assistir aula, vídeo, material, avaliação, progresso real) acontece **fora**,
na plataforma parceira (EA), via `usuarios/novo` + `usuarios/vinculocurso` + login externo no host da fornecedora (`EA_STUDENT_LOGIN_URL`).

| Camada | Existe hoje? | Onde |
|---|---|---|
| Catálogo de cursos (global, compartilhado) | ✅ | `Course`, `Category`, `CourseLesson` (só nomes de aula), `TenantCourse` (preço/visibilidade por tenant) |
| Área do aluno (`/aluno`) com login isolado por tenant | ✅ | `src/app/aluno/*`, `src/lib/auth.ts` (login dual User/Student) |
| Branding dinâmico por tenant | ✅ | `getCurrentTenant()` em `src/lib/tenant/current.ts` |
| Matrícula automática pós-pagamento | ✅ | `src/lib/enrollment/fulfill.ts`, `src/lib/mercadopago/process.ts` |
| Certificado automático (≥80% + concluído) | ✅ | `Certificate`, cron `sync-progresso` |
| **Conteúdo real da aula (vídeo, texto, material)** | ❌ | hoje vive na EA |
| **Módulos / estrutura pedagógica** | ❌ | `CourseLesson` é uma lista plana de nomes |
| **Player de vídeo próprio** | ❌ | aponta para EA externa |
| **Progresso por aula / "marcar como concluída"** | ❌ | só lemos % agregado da EA |
| **Avaliações / quiz no nosso sistema** | ❌ | — |
| **Painel de autoria de conteúdo (admin)** | ❌ | — |

**Conclusão:** não é refatoração de integração — é **adicionar um LMS** sobre a fundação que já existe.
A boa notícia: a casca (auth, multi-tenant, matrícula, certificado, design) já está pronta e madura.

---

## 1. Design System extraído (referência de implementação)

Tudo abaixo já está implementado e deve ser **reutilizado tal e qual** na plataforma do aluno.
Fonte da verdade: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/*`, `docs/references/design-system.md`.

### 1.1 Cores da marca (tokens em `src/app/globals.css`)

```css
/* Marca PMB */
--color-pmb-green:       #025918;  /* PRIMARY / brand */
--color-pmb-green-700:   #014712;  /* sidebar, hover escuro */
--color-pmb-green-900:   #012e0b;  /* texto foreground */
--color-pmb-gold:        #F2B705;  /* ACCENT / CTA secundário */
--color-pmb-gold-600:    #D9A304;  /* gold hover */
--color-pmb-cyan:        #07B2D9;  /* selo "Novo" */
--color-pmb-cyan-50:     #E6F7FC;
--color-pmb-lime:        #C0D904;  /* selo "Mais Vendido" */
--color-pmb-lime-50:     #F4FAD4;
--color-pmb-terracotta:  #8C3A27;  /* destrutivo / erro */
--color-pmb-mist:        #F4F4EE;  /* fundo muito claro */

/* Tokens semânticos (light) */
--background:#FFFFFF  --foreground:#012e0b
--primary:#025918     --primary-foreground:#FFFFFF
--secondary:#F4FAD4   --accent:#F2B705
--muted:#F4F4EE       --muted-foreground:#4a6b4f
--destructive:#8C3A27 --ring:#025918
--radius:0.75rem      /* 12px base */
```

> Importante: a área do aluno em vitrine de revendedor herda o branding do **tenant** (cores/logo via
> `getCurrentTenant()`). O verde/ouro PMB é o **default**; o player deve usar tokens semânticos
> (`--primary`, `--accent`) e não hex fixos, para respeitar a personalização do tenant.

### 1.2 Tipografia (`src/app/layout.tsx`)
- **Sans (corpo/títulos):** `DM Sans` (400/500/700) → `--font-sans`
- **Mono (preços, números, código):** `Geist Mono` → `--font-geist-mono`

### 1.3 Componentes base (shadcn/ui em `src/components/ui/`)
Disponíveis: `accordion, alert-dialog, avatar, badge, button, card, dialog, dropdown-menu, input,
label, select, separator, sheet, skeleton, sonner (toast), switch, table, tabs, textarea, tooltip`.

- **Button** (`button.tsx`): `rounded-lg`, variantes `default / outline / secondary / ghost / destructive / link`; tamanhos `xs → lg`, `icon-*`. Press: `active:translate-y-px`. Focus: `ring-3 ring-ring/50`.
- **Card** (`card.tsx`): `rounded-xl bg-card ring-1 ring-foreground/10`, `CardFooter` com `border-t bg-muted/50`.
- **Badge** (`badge.tsx`): `rounded-4xl h-5 text-xs`, variantes idem button.
- **Input** (`input.tsx`): `h-8 rounded-lg`, focus ring verde.

### 1.4 Padrões de layout (regras de ouro)
- **Container:** `max-w-7xl` (1280px) centralizado; navbar usa `max-w-[1280px]`.
- **Padding horizontal:** `px-4 md:px-6`. **Card:** `p-4` (sm) / `p-6 lg:p-8` (grande).
- **Sidebar painel:** `w-60` (240px) fixa, `bg-[var(--color-pmb-green-700)]`, item ativo com accent.
- **Raios:** cards `rounded-xl`/`rounded-2xl`, botões/inputs `rounded-lg`, pílulas `rounded-full`.
- **Sombras:** sutil `shadow-sm`; hover de card de curso `shadow-[0_10px_30px_-12px_rgba(2,89,24,0.25)]` + `-translate-y-0.5`.
- **Navbar:** sticky, `h-[80px] md:h-[92px]`, `shadow-[0_1px_0_0_rgba(2,89,24,0.08)]`, logo `h-14 md:h-16`.
- **Footer:** `bg-[var(--color-pmb-green)]`, selo "Powered by PMB".
- **Motion:** `transition-colors`/`transition-all` 200–300ms; respeitar `prefers-reduced-motion`.

### 1.5 "Sabor" visual do player (derivado do DS)
- Card de curso na biblioteca = mesmo padrão do `course-card.tsx` da vitrine (capa + selo + barra de progresso verde).
- Barra de progresso: trilho `bg-muted`, preenchimento `bg-[var(--color-pmb-green)]`, `rounded-full`.
- Aula concluída: check `--color-pmb-lime` / `--color-pmb-green`. Aula atual: destaque `--color-pmb-gold`.
- Botão "Concluir e avançar": `Button` default verde, full-width no mobile.

---

## 2. Princípios de produto (foco no leigo)

O público é o aluno de curso livre — muitas vezes pouco familiarizado com tecnologia. Diretrizes:

1. **Um clique para começar.** Pós-compra, o aluno cai direto no player no ponto onde parou ("Continuar de onde parou"). Sem busca, sem configuração.
2. **Caminho linear e óbvio.** Lista de aulas numerada à esquerda, vídeo no centro, botão grande "Marcar como concluída → próxima aula". Nada de árvore complexa.
3. **Sempre saber onde está.** Progresso visível em todo lugar (% do curso, aula X de Y, próximo passo).
4. **Zero jargão.** "Aulas", "Material para baixar", "Certificado", "Tirar dúvida" — linguagem simples.
5. **Funciona no celular** (maioria do público). Mobile-first; vídeo responsivo; menu de aulas em `Sheet` (drawer).
6. **Recuperação fácil.** "Esqueci a senha" e suporte a 1 clique. Login por CPF (já suportado) reduz fricção.
7. **Recompensa visível.** Barra que enche, selo de módulo concluído, certificado destravando ao final — motivação para o leigo.
8. **Tolerante a conexão ruim.** Qualidade adaptativa (HLS), retomar de onde parou, materiais baixáveis offline (PDF).

---

## 3. Arquitetura — como encaixa no multi-tenant

### 3.1 Princípio central: **conteúdo global, acesso por tenant**

Espelha exatamente o que já é o catálogo:

```
CONTEÚDO (autorado 1x pela PMB, compartilhado por todos)   ACESSO (por tenant)
┌─────────────────────────────────────────┐               ┌──────────────────────────┐
│ Course → Module → Lesson → (vídeo, texto,│               │ Student (tenantId)        │
│ material, quiz)                          │   consumido   │ Enrollment (curso liberado)│
│ Mesmo para revenda1, revenda2 e PMB      │  ──────────▶  │ LessonProgress (por aula) │
└─────────────────────────────────────────┘               └──────────────────────────┘
```

- O **conteúdo da aula é o mesmo** para todos os tenants (a PMB é a "produtora" dos cursos livres).
- O que é por tenant: **quem comprou** (`Enrollment`), **o branding** (cores/logo da vitrine) e o **progresso individual** (`LessonProgress`).
- Isso reaproveita o modelo `Course`/`TenantCourse` já existente — só adicionamos a **árvore de conteúdo** abaixo de `Course`.

### 3.2 Onde mora a área do aluno
Já existe `/aluno` (`src/app/aluno/*`) com:
- Login dual (User/Student) tenant-aware em `src/lib/auth.ts` — aluno loga por **CPF ou email**, escopado ao tenant do subdomínio.
- Guard cross-tenant no `aluno/layout.tsx` (desloga se `session.tenantId !== tenant.id`).
- Branding via `getCurrentTenant()`.

Adicionamos as rotas do LMS **dentro** dessa casca:
```
/aluno                          (já existe) dashboard "Continuar estudando"
/aluno/cursos                   (já existe) biblioteca → vira grade com barra de progresso
/aluno/curso/[slug]             NOVO  página do curso (módulos + aulas + "começar")
/aluno/curso/[slug]/[lessonId]  NOVO  PLAYER (vídeo + lista de aulas + material + dúvida)
/aluno/certificados             (já existe) ganha "destrava ao concluir"
```

### 3.3 Autoria (admin) — onde o conteúdo é criado
Novo módulo no painel **admin** (SUPER_ADMIN), porque o catálogo é global:
```
/admin/cursos                       lista de cursos (já há sync da EA; agora também "cursos próprios")
/admin/cursos/[id]/conteudo         NOVO  editor: módulos, aulas, upload de vídeo, material, quiz
```
Revendedores **não** autoram conteúdo (mantém o modelo atual: PMB produz, revenda revende).
Eventual evolução: permitir que um tenant PRO crie cursos próprios visíveis só na sua vitrine
(`Course.tenantId` opcional) — fora do MVP.

### 3.4 Cookies / domínios
Cookies de sessão são isolados por domínio (já é assim). O aluno que compra em
`joao.livrecursos.com.br` loga e assiste **nesse mesmo subdomínio** — o player roda lá, com o
branding do João, mas servindo o **mesmo vídeo** que todos os outros tenants. Nenhuma mudança de
infra de cookie é necessária.

### 3.5 Servir o vídeo com segurança (não vazar entre alunos/tenants)
- A URL do vídeo **nunca** é exposta crua no HTML. O player pede a uma API
  (`GET /api/aluno/lesson/[id]/playback`) que valida `requireStudentSession()` → o aluno tem
  `Enrollment` ATIVO no `Course` daquela `Lesson` **e** no tenant correto. Só então a API gera uma
  **presigned URL do MinIO de curta duração** (ex.: 10–15 min) e devolve ao player.
- A presigned URL é gerada server-side com a SDK S3 (`@aws-sdk/s3-request-presigner`) apontando para
  o endpoint do MinIO. O objeto fica em bucket **privado**; sem assinatura, 403.
- Isso reusa o padrão atual (server component + Prisma + isolamento por `tenantId`). Detalhe do
  pipeline e do caso HLS em §6.

---

## 4. Modelo de dados — adições ao Prisma

Adições mínimas para o MVP (mantém `Course`/`Category`/`TenantCourse` intactos; `CourseLesson`
atual pode ser migrado para `Lesson` ou mantido como legado do sync da EA).

```prisma
/// Módulo (seção) dentro de um curso. Conteúdo GLOBAL, compartilhado por todos os tenants.
model Module {
  id        String   @id @default(cuid())
  courseId  String   @map("course_id")
  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  title     String
  ordem     Int
  lessons   Lesson[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@unique([courseId, ordem])
  @@map("modules")
}

/// Aula. Tipo de conteúdo flexível (vídeo é o principal, mas suporta texto/material/quiz).
model Lesson {
  id          String      @id @default(cuid())
  moduleId    String      @map("module_id")
  module      Module      @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  title       String
  ordem       Int
  type        LessonType  @default(VIDEO)   // VIDEO | TEXT | PDF | QUIZ
  // Vídeo auto-hospedado em MinIO (bucket privado). Guardamos a CHAVE do objeto, nunca a URL.
  videoBucket  String?    @map("video_bucket")  // bucket MinIO (ex.: "ead-videos")
  videoKey     String?    @map("video_key")     // chave HLS master ou MP4 (ex.: "courses/<id>/lessons/<id>/master.m3u8")
  videoStatus  VideoStatus @default(NONE) @map("video_status") // NONE | UPLOADING | PROCESSING | READY | FAILED
  durationSec  Int?       @map("duration_sec")
  // Texto rico (aula sem vídeo / complemento)
  contentHtml  String?    @db.Text @map("content_html")
  // Liberação
  isFreePreview Boolean   @default(false) @map("is_free_preview") // amostra grátis na vitrine
  materials    LessonMaterial[]
  quiz         Quiz?
  progress     LessonProgress[]
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")
  @@unique([moduleId, ordem])
  @@index([moduleId])
  @@map("lessons")
}

enum LessonType { VIDEO TEXT PDF QUIZ }
enum VideoStatus { NONE UPLOADING PROCESSING READY FAILED }

/// Material para download (apostila, slide, modelo). Arquivo no Supabase Storage.
model LessonMaterial {
  id        String   @id @default(cuid())
  lessonId  String   @map("lesson_id")
  lesson    Lesson   @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  title     String
  fileUrl   String   @map("file_url")
  fileSize  Int?     @map("file_size")
  createdAt DateTime @default(now()) @map("created_at")
  @@map("lesson_materials")
}

/// Progresso POR ALUNO POR AULA. Isolado por tenant via Student.
model LessonProgress {
  id           String    @id @default(cuid())
  studentId    String    @map("student_id")
  student      Student   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  lessonId     String    @map("lesson_id")
  lesson       Lesson    @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  enrollmentId String?   @map("enrollment_id") // amarra ao acesso pago
  completed    Boolean   @default(false)
  lastPositionSec Int    @default(0) @map("last_position_sec") // retomar vídeo
  completedAt  DateTime? @map("completed_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  @@unique([studentId, lessonId])
  @@index([studentId])
  @@map("lesson_progress")
}

/// Quiz simples (avaliação ao fim do módulo/curso). Opcional no MVP.
model Quiz {
  id        String       @id @default(cuid())
  lessonId  String       @unique @map("lesson_id")
  lesson    Lesson       @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  passScore Int          @default(70) @map("pass_score") // % para aprovar
  questions QuizQuestion[]
  attempts  QuizAttempt[]
  @@map("quizzes")
}

model QuizQuestion {
  id        String @id @default(cuid())
  quizId    String @map("quiz_id")
  quiz      Quiz   @relation(fields: [quizId], references: [id], onDelete: Cascade)
  prompt    String @db.Text
  options   Json   // [{ id, text }]
  correctId String @map("correct_id")
  ordem     Int
  @@map("quiz_questions")
}

model QuizAttempt {
  id        String   @id @default(cuid())
  quizId    String   @map("quiz_id")
  quiz      Quiz     @relation(fields: [quizId], references: [id], onDelete: Cascade)
  studentId String   @map("student_id")
  score     Int
  passed    Boolean
  answers   Json
  createdAt DateTime @default(now()) @map("created_at")
  @@index([quizId, studentId])
  @@map("quiz_attempts")
}
```

**Progresso agregado:** `Enrollment.progressPercent` / `progressStatus` (já existem) passam a ser
**calculados a partir de `LessonProgress`** (aulas concluídas / total), em vez de lidos da EA.
O gatilho de **certificado** (≥ `certificateMinPercent`, default 80%) continua igual — só muda a fonte do número.
Isso mantém todo o fluxo de certificado já construído **sem alteração**.

---

## 5. Funcionalidades do LMS (escopo completo)

### 5.1 Para o ALUNO (foco no leigo)
- **Dashboard "Continuar estudando":** card grande com o curso em andamento + botão "Continuar de onde parou".
- **Biblioteca:** grade de cursos comprados, com capa, % de progresso e status (Em andamento / Concluído).
- **Página do curso:** descrição, lista de módulos/aulas, duração total, botão "Começar"/"Continuar", barra de progresso, aulas com check de concluído. Aulas marcadas `isFreePreview` assistíveis antes de comprar (gancho de venda).
- **Player de aula:**
  - Vídeo responsivo (HLS, qualidade adaptativa), retoma do `lastPositionSec`.
  - Lista de aulas lateral (drawer no mobile) com indicação de atual/concluída.
  - Botão "Marcar como concluída e avançar".
  - Aba **Materiais** (PDF/apostila para baixar).
  - Aba **Tirar dúvida** (suporte simples — ver 5.4).
  - Auto-avanço opcional para próxima aula.
- **Avaliação (quiz)** opcional ao fim do módulo/curso, com nota mínima para concluir.
- **Certificado:** destrava ao concluir (≥80%); download em PDF (já implementado).
- **Perfil & senha** (já existe). Login por CPF (já existe) — ideal para o leigo.
- **Notificações simples:** "Você concluiu o Módulo 2!", "Seu certificado está pronto".

### 5.2 Para o ADMIN (autoria — SUPER_ADMIN)
- **Editor de curso:** criar/ordenar **módulos** e **aulas** (drag-and-drop simples).
- **Upload de vídeo:** envia ao provedor (Mux/Bunny/Cloudflare); o sistema guarda só o `videoAssetId` e a duração.
- **Materiais:** upload de PDFs/arquivos (Supabase Storage — já usado para vitrine/capa).
- **Texto rico:** aulas só-texto ou complemento (editor WYSIWYG).
- **Quiz:** montar perguntas de múltipla escolha + nota de corte.
- **Preview "como aluno"** e publicação (rascunho → publicado).
- **Migração da EA:** importar a estrutura de aulas atual (`CourseLesson`) como esqueleto a preencher.

### 5.3 Para o REVENDEDOR (painel — sem mudança grande)
- Continua só **revendendo** (preço/visibilidade via `TenantCourse`).
- Ganha relatório: "alunos ativos", "% médio de conclusão", "certificados emitidos" — dados que **agora são nossos** (não dependem da EA).

### 5.4 Suporte / dúvidas (simples, sem fórum complexo)
- MVP: "Tirar dúvida" abre o canal de suporte já existente (`/aluno/suporte`) com contexto da aula.
- Evolução: comentários por aula (lista simples, sem threading), moderados pelo admin.

### 5.5 O que **fica de fora** do MVP (consciente)
Aulas ao vivo/Zoom, fórum/comunidade, gamificação avançada (pontos/ranking), trilhas adaptativas,
app nativo, conteúdo SCORM. Tudo adicionável depois — não bloqueia o desacoplamento da EA.

---

## 6. Hospedagem de vídeo — MinIO (auto-hospedado, S3-compatível)

> **Decisão tomada:** vídeo em **MinIO**. Esta seção desenha como fazer isso bem feito e onde
> está a complexidade.

### 6.1 Heads-up honesto (precisa estar ciente)
MinIO é **storage de objetos** (S3-compatível) — ele te dá **guarda do arquivo + URLs assinadas
(presigned)**, que resolvem o **controle de acesso** muito bem. Mas, ao contrário de um Mux/Bunny,
MinIO **não faz por si só**:
- **encode/transcodificação** para múltiplas qualidades (240p/480p/720p/1080p);
- **streaming adaptativo (HLS)** — ele só serve o arquivo que você colocar lá;
- **CDN** (cache na borda perto do aluno).

Ou seja: você ganha **propriedade total dos dados + custo previsível de storage**, mas assume a
**engenharia do pipeline de vídeo** (transcode + empacotar HLS + assinar + idealmente CDN na frente).
Para um produto "focado no leigo / simples", isso é o ponto que mais exige cuidado operacional.
A recomendação abaixo mantém o MVP **simples** e deixa o avançado (HLS adaptativo, CDN) para depois.

### 6.2 Pipeline recomendado

**MVP (simples e suficiente):** **MP4 progressivo único (720p) + presigned URL.**
```
Admin faz upload  →  API gera presigned PUT (upload direto ao MinIO, bucket privado "ead-videos")
                  →  job de transcode (ffmpeg) normaliza para 1 MP4 720p H.264 + extrai duração
                  →  Lesson.videoStatus = READY, grava videoBucket/videoKey/durationSec
Aluno assiste     →  GET /api/aluno/lesson/[id]/playback valida matrícula
                  →  gera presigned GET (TTL ~15 min) do MP4
                  →  <video src> com suporte nativo a Range (seek funciona)
```
- O `<video>` do navegador faz **range requests** em MP4 → seek e retomar posição funcionam sem HLS.
- Protege contra vazamento: bucket privado + URL expira em minutos. Cada `play` pede nova URL.
- Transcode pode rodar como **job em fila** (ver §6.3). Enquanto processa, `videoStatus=PROCESSING`
  e o editor mostra "convertendo…".

**Fase 2 (qualidade/escala):** **HLS adaptativo + CDN.**
- ffmpeg gera renditions HLS (`master.m3u8` + `.ts` por qualidade) → tudo no MinIO.
- Como o `.m3u8` referencia muitos segmentos, **assinar cada segmento** é chato. Duas saídas:
  (a) **CDN na frente do MinIO** (Cloudflare/BunnyCDN como *pull zone*) com **signed cookies/URL**,
  ou (b) uma **rota proxy** Next que valida sessão e faz stream dos segmentos. Para escala, (a) é melhor.
- Só vale a pena quando houver volume de alunos / vídeos longos. Não bloqueia o MVP.

### 6.3 Transcodificação (onde roda o ffmpeg)
Vercel Functions não são lugar para encode pesado de vídeo. Opções:
- **Worker dedicado** (uma pequena VM/contêiner perto do MinIO) consumindo uma fila
  (Upstash QStash — já usam Upstash — ou similar). Recebe "novo upload", baixa do MinIO, transcoda,
  sobe o resultado, chama um webhook interno que marca `videoStatus=READY`. **Recomendado.**
- Alternativa "0 infra extra" no MVP: aceitar o MP4 como enviado (exigir do time de conteúdo um MP4
  720p H.264 já pronto), pulando o transcode. Mais simples, porém depende de disciplina no upload.

### 6.4 Infra MinIO (perguntas em aberto — ver §9)
- MinIO **já existe** num servidor de vocês, ou precisa provisionar? Onde (VPS, Hetzner, Contabo,
  bare metal)? Qual capacidade/banda? Backup? Isso define custo real e SLA.
- Endpoint, credenciais e bucket entram como env: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`,
  `MINIO_SECRET_KEY`, `MINIO_BUCKET_VIDEOS`, `MINIO_REGION`. Acesso via SDK S3 (`@aws-sdk/client-s3`
  + `@aws-sdk/s3-request-presigner`) com `forcePathStyle: true`.

### 6.5 Materiais (PDF/apostila)
Seguem no **Supabase Storage** (já usado para capa/vitrine) **ou** num bucket MinIO `ead-materiais`.
Recomendo padronizar no MinIO junto com vídeo para ter um lugar só de conteúdo pago — também via
presigned URL com validação de matrícula.

---

## 7. Estratégia de migração (EA → própria)

Migração **gradual e reversível**, sem big-bang. Por curso, com flag.

1. **Convivência:** adicionar campo `Course.deliveryMode` = `EA` | `NATIVE` (default `EA`).
   Matrícula e player checam o modo: `EA` segue o fluxo atual; `NATIVE` usa o LMS novo.
2. **Curso piloto:** escolher 1 curso, montar o conteúdo no editor novo, marcar `NATIVE`,
   validar fim-a-fim (compra → player → progresso → certificado) numa vitrine.
3. **Onda a onda:** migrar conteúdo curso a curso. O catálogo, preço e checkout **não mudam**.
4. **Progresso:** para cursos `NATIVE`, `Enrollment.progressPercent` passa a vir de `LessonProgress`;
   desliga-se o `sync-progresso` da EA apenas para esses cursos.
5. **Desligamento:** quando todos os cursos forem `NATIVE`, removem-se as chamadas EA
   (`criarAluno`, `vincularCurso`, `cursosVinculados`, crons de sync) e as env `EA_*`.
   Pontos de acoplamento já mapeados em `docs/` (client em `src/lib/plataforma-cursos/`,
   provisioning em `src/lib/students/plataforma-actions.ts`, progresso em `src/lib/students/progress.ts`).

Alunos **já matriculados** em cursos que migrarem: criar `LessonProgress` inicial a partir do `%`
atual da EA (aproximação) ou simplesmente começar do zero com aviso amigável.

---

## 8. Roadmap em fases

### Fase 0 — Fundação MinIO + dados (1 sprint)
- Provisionar/validar MinIO (endpoint, bucket privado, credenciais, env `MINIO_*`).
- Helpers S3: presigned PUT (upload) e presigned GET (playback) com `@aws-sdk/client-s3`.
- Definir caminho do transcode (worker + fila QStash **ou** upload de MP4 720p pronto no MVP — §6.3).
- Migração Prisma: `Module`, `Lesson`, `LessonMaterial`, `LessonProgress`, `Quiz*`
  (+ `deliveryMode` em `Course`, enum `VideoStatus`).
- API `GET /api/aluno/lesson/[id]/playback` com guard de matrícula → presigned GET.

### Fase 1 — Player MVP + quiz (aluno) (2–3 sprints)
- `/aluno/curso/[slug]` (módulos/aulas) + `/aluno/curso/[slug]/[lessonId]` (player).
- Marcar aula concluída, retomar posição (`lastPositionSec`), barra de progresso, materiais para baixar.
- **Quiz com nota de corte** ao fim do módulo/curso (`Quiz`, `QuizAttempt`) — bloqueia conclusão se reprovado.
- Recalcular `Enrollment.progressPercent` a partir de `LessonProgress` → dispara certificado existente.
- Dashboard "Continuar estudando".

### Fase 2 — Autoria (admin) (2 sprints)
- `/admin/cursos/[id]/conteudo`: CRUD de módulos/aulas, **upload de vídeo (presigned PUT)**, materiais, texto rico.
- Editor de quiz (perguntas múltipla escolha + nota de corte).
- Importar esqueleto de `CourseLesson` (EA) para acelerar.
- Preview "como aluno" + publicar.

### Fase 3 — Migração piloto (1 sprint)
- `deliveryMode=NATIVE` no curso piloto; teste fim-a-fim em vitrine real (compra → player → quiz → certificado).
- Aviso amigável de "progresso recomeça" para quem já estava no curso (decisão §9.4).

### Fase 4 — Rollout + desligar EA (contínuo)
- Migrar cursos em ondas; relatórios de conclusão no painel do revendedor.
- Ao final, remover integração EA e env `EA_*`.

---

## 9. Decisões — status

**Travadas (2026-06-10):**
1. ✅ **Vídeo:** MinIO (auto-hospedado). Pipeline em §6.
2. ✅ **Autoria:** só a PMB (catálogo global). Revendedores apenas revendem.
3. ✅ **Quiz:** entra no MVP (Fase 1).
4. ✅ **Migração de progresso:** começa do zero, com aviso amigável.
5. ✅ **Escopo MVP:** player de vídeo + materiais + **quiz** + progresso + certificado.

**Ainda em aberto (sobre o MinIO — necessárias antes da Fase 0):**
- A) **Infra:** MinIO já está rodando em algum servidor de vocês, ou precisa provisionar? Onde
  (VPS/bare metal), com quanta capacidade e banda? Há backup/redundância? → define custo e SLA reais.
- B) **Transcode:** topam subir um **worker de ffmpeg** (fila QStash) para converter os vídeos, ou no
  MVP o time de conteúdo sobe **MP4 720p já pronto** (sem transcode) para simplificar?
- C) **CDN:** aceitam servir direto do MinIO no início (ok para volume baixo/médio) e só colocar CDN
  na Fase 2 quando crescer? Há preferência de CDN (Cloudflare/Bunny) na frente do MinIO?
