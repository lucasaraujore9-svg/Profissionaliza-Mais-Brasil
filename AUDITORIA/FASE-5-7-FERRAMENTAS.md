# Fases 5 e 7 — Resultados de ferramentas (determinístico)

> Executado em 2026-05-30. `npm run build` foi deliberadamente **não** executado porque o script `build` roda `db:apply-pending` (aplica migrations no banco real) — efeito colateral inaceitável numa auditoria.

## TypeScript — `tsc --noEmit`
- **EXIT 0 — 0 erros.** O projeto compila em modo strict sem erros de tipo. Excelente sinal de maturidade.

## ESLint — `eslint .`
- **0 erros, 9 warnings.**

| arquivo:linha | regra | nota |
|---|---|---|
| `src/app/api/loja/leads/route.ts:18` | no-unused-vars (`phoneRegex`) | ⚠️ **Relevante**: regex de telefone declarado mas **nunca aplicado** — sugere validação de telefone pretendida e esquecida na rota pública de captura de leads. Verificar (Fase 2/4). |
| `src/components/painel/lead-detail-drawer.tsx:111` | react-hooks/exhaustive-deps (`apiBase`) | Dep faltante em useCallback. |
| `src/components/painel/leads-kanban-board.tsx:69,107` | react-hooks/exhaustive-deps (`apiBase`) | idem (2x) |
| `src/components/painel/message-template-editor.tsx:90` | react-hooks/exhaustive-deps (`apiBase`) | idem |
| `src/components/painel/whatsapp-connection-panel.tsx:92` | react-hooks/exhaustive-deps (`apiBase`) | idem |
| `src/app/admin/automacao/page.tsx:4` | no-unused-vars (`Zap`) | import morto |
| `src/app/loja/layout.tsx:12` | no-unused-vars (`SITE_NAME`) | var morta |
| `src/lib/automation/leads.ts:4` | no-unused-vars (`resolveAutomationContext`) | import morto |

**Avaliação:** os 6 warnings de `exhaustive-deps` (todos `apiBase` faltando) são consistentes — provavelmente `apiBase` é estável (derivado de prop/contexto), mas o padrão repetido merece revisão (risco de stale closure se `apiBase` mudar em runtime, ex. troca de tenant no painel).

## `npm audit` — 14 vulnerabilidades (1 alta · 10 moderadas · 3 baixas)

| Pacote | Severidade | Problema | Correção |
|---|---|---|---|
| **xlsx** (SheetJS) | 🔴 **Alta** | Prototype Pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9) | **Sem fix no npm.** Migrar para `xlsx` do CDN oficial SheetJS ou trocar por `exceljs`. Mitigar: não passar entrada não confiável ao parser; uso é só geração de export (menor risco), confirmar que não há *leitura* de planilhas enviadas por usuário. |
| **postcss** (<8.5.10, via next) | 🟡 Moderada | XSS via `</style>` não escapado no stringify (GHSA-qx2v-qp2m-jg93) | Vem transitivo do Next; atualizar Next quando possível. Baixo impacto real (build-time). |
| **uuid** (<11.1.1, via mercadopago) | 🟡 Moderada | Buffer bounds check ausente (GHSA-w5hq-g745-h8pq) | Transitivo do SDK mercadopago; baixo impacto (uso interno). |
| **@auth/core / nodemailer / next-auth beta** | 🟡 Moderada | next-auth v5 beta depende de versões vulneráveis de @auth/core e nodemailer | Acompanhar release estável do next-auth v5; hoje é beta.30. |
| 3 low | 🔵 Baixa | — | Acompanhar. |

**Ação recomendada (prioridade):**
1. **xlsx (alta):** confirmar que o app só *gera* (write) e nunca *lê* (read) planilhas vindas de upload de usuário. Se só gera, risco prático é baixo, mas ainda assim planejar substituição por `exceljs`.
2. Rodar `npm audit fix` (sem `--force`) para as correções não-disruptivas.
3. Evitar `npm audit fix --force` (rebaixaria `next`→9 e `mercadopago`→0.5 — breaking).
