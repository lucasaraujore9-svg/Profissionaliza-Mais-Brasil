# Issue 100 — Remover PII (CPF) do bucket público de certificados

**Tipo:** sec (remediação)
**Escopo:** `src/lib/certificates/storage.ts` · `src/lib/certificates/generate-pdf.ts` · `src/lib/certificates/code.ts` · `src/app/validar/[code]/page.tsx` · `src/app/api/student/certificates/[id]/download/route.ts` · Supabase Storage (bucket `certificates`)
**Depende de:** nenhuma
**Prioridade:** P0
**Risco:** R1 (Crítico) + R12 (Alto)

## Contexto / Evidência
PDFs de certificado contêm **nome + CPF** e são servidos por URL pública previsível:
`/storage/v1/object/public/certificates/{tenantId|pmb}/{code}.pdf`. O `code` aparece na página
pública `/validar/{code}` e tem **~28 bits de entropia** (`code.ts:8-9` descarta o 8º char hex). O
Storage é acessado direto, **sem rate-limit** (o limite de `/validar` não cobre o objeto). Resultado:
download anônimo em massa de PII — violação LGPD (arts. 6, 46, 48); CWE-200/CWE-330; OWASP A01/A02.

## O Que Fazer
1. Tornar o bucket `certificates` **privado** no Supabase Storage.
2. Servir o PDF apenas via **signed URL de curta duração** (ex: 60–300s), gerada por rota
   autenticada do aluno dono (`student/certificates/[id]/download`) e/ou por `/validar/{code}` após
   resolver o registro do certificado.
3. Aumentar a entropia do `code` para 32+ bits reais (preferir `crypto.randomUUID()` ou base32 de
   ≥160 bits para o nome do objeto; o código humano de validação pode permanecer curto, mas o **path
   do objeto não pode ser adivinhável**).
4. Adicionar rate-limit no endpoint de download/validação (reusar `RATE_LIMITS.certificateValidate`
   e criar bucket para download).
5. **Alternativa de menor blast-radius** (se preferir manter validação pública): a página `/validar`
   exibe só nome do curso + validade + status (sem CPF), e o **download do PDF completo exige
   autenticação** do aluno dono.

## Decisão humana necessária
- A validação pública continua mostrando o PDF ou só os metadados? (define a abordagem 2 vs 5)
- Certificados já emitidos: re-gerar com novo path/entropia ou manter os antigos (mitigar via bucket privado + signed URL mesmo para os existentes).

## Critério de Aceite
- [ ] Bucket `certificates` privado (sem `/object/public/`).
- [ ] Nenhum PDF de certificado acessível sem signed URL válida.
- [ ] Path do objeto não enumerável (≥128 bits de entropia no nome do arquivo).
- [ ] Rate-limit no download/validação.
- [ ] QR code e fluxo de validação continuam funcionando (teste manual).
- [ ] Certificados pré-existentes não ficam acessíveis publicamente.
- [ ] R1/R12 atualizados em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
