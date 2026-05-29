# Issue 071 — Suporte do aluno passa a gravar (ContactMessage com historico)

**Tipo:** behavior
**Escopo:** `src/app/api/aluno/suporte/route.ts`
**Depende de:** 068
**Prioridade:** P1

## Contexto

Hoje `/api/aluno/suporte` so dispara email + notificacao in-app, sem persistir. Sem historico/auditoria. Passa a gravar `ContactMessage` (kind=`STUDENT_SUPPORT`), roteado para o dono do aluno (unidade ou PMB), mantendo email e notificacao como estao.

## O que fazer

### `src/app/api/aluno/suporte/route.ts`

- Manter: validacao (`assunto` 3-120, `mensagem` 10-2000), lookup do student, notificacao in-app, email com `replyTo` do aluno.
- **Acrescentar** antes/junto das notificacoes:
  ```ts
  await prisma.contactMessage.create({
    data: {
      kind: "STUDENT_SUPPORT",
      tenantId: isPmb ? null : student.tenantId,
      studentId: student.id,
      nome: student.nome,
      email: student.email ?? null,
      telefone: student.fone ?? null,
      assunto,
      mensagem,
      source: "aluno",
    },
  })
  ```
  (Para PMB, `tenantId` deve ser `null` seguindo o padrao do resto do sistema — derivar de `isPmb` em vez de usar o id do tenant placeholder `__pmb__`.)
- Ajustar `href` das notificacoes para apontar tambem para a caixa de atendimento (`/admin/atendimento` / `/painel/atendimento`) alem de `/admin/alunos/[id]`, conforme a UI da 072.

## Criterios de Aceite

- [ ] Cada chamado do aluno cria um `ContactMessage` kind=STUDENT_SUPPORT roteado por tenant (PMB -> null)
- [ ] `studentId` preenchido; email e notificacao continuam funcionando
- [ ] `npx tsc --noEmit` + `npm run build` verdes
