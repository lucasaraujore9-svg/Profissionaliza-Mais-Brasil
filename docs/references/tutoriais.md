# Tutoriais guiados (tours) — guia de manutenção

Sistema de tutoriais on-screen (balões/spotlight via **driver.js**) que cobre
**cada página e função** das áreas `/painel` (revendedor/consultor) e `/aluno`.

## Como funciona

- Um **engine genérico** (`src/components/shared/tour/tour-runner.tsx`) é montado
  uma vez por área: no shell do painel (`src/app/painel/layout-shell.tsx`) e no
  shell do aluno (`src/components/aluno/student-shell.tsx`).
- A cada mudança de rota, o engine chama `findTour(area, pathname, role)`
  (`src/lib/tours/registry.ts`) para descobrir o tour daquela página.
- **Disparo:** auto-inicia na **1ª visita** de cada página (desktop, `lg+`).
  Ao fechar (concluir ou X), o tour é marcado como **visto** e não auto-reabre.
- **Rever:** o botão de ajuda (`?`, `data-tour="tour-help"`) no header dispara o
  evento `pmb:replay-tour`, que reabre o tour **da página atual** mesmo já visto.
- **Persistência:** o id do tour entra em `User.dismissedTours` (painel) ou
  `Student.dismissedTours` (aluno) via `POST /api/tours/dismiss`. Compat: a flag
  legada `User.onboardingTourCompletedAt`, se preenchida, semeia
  `painel.overview` como visto.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/tours/types.ts` | Tipos (`TourDef`, `TourStep`) + helpers `exact`/`prefix`. |
| `src/lib/tours/painel.ts` | Tours da área `/painel`. |
| `src/lib/tours/aluno.ts` | Tours da área `/aluno`. |
| `src/lib/tours/registry.ts` | Agrega tudo + `findTour`. |
| `src/components/shared/tour/tour-runner.tsx` | Engine (driver.js). |
| `src/app/api/tours/dismiss/route.ts` | Persiste a dispensa (User ou Student). |
| `src/app/globals.css` | Tema `.pmb-tour` do popover. |

## Adicionar um tutorial a uma página nova

1. **Ancore os controles** que o tour vai destacar, com `data-tour="<area>:<chave>"`:

   ```tsx
   <button data-tour="alunos:exportar">Exportar</button>
   ```

   Convenção de chave: `"<rota>:<controle>"` (ex.: `"alunos:exportar"`).
   Itens de sidebar já usam `data-tour="nav:/painel/x"`.

2. **Registre o tour** no array da área (`painel.ts` ou `aluno.ts`):

   ```ts
   const ALUNOS_STEPS: TourStep[] = [
     { title: "Seus alunos", description: "..." },               // centralizado
     { selector: anchor("alunos:exportar"), title: "Exportar",
       description: "...", side: "bottom", align: "start" },
   ]

   // dentro de PAINEL_TOURS:
   {
     id: "painel.alunos",            // id estável — NÃO renomeie após publicar
     area: "painel",
     label: "Alunos",
     matches: exact("/painel/alunos"),
     steps: ALUNOS_STEPS,
   }
   ```

3. Pronto. O engine auto-inicia na 1ª visita e o `?` reabre.

### Regras importantes

- **`id` é a chave de persistência.** Renomear faz todos reverem o tour. Para
  forçar reexibição após uma grande mudança de UI, troque o `id` de propósito.
- **Passos com alvo ausente são pulados** automaticamente (`visibleSteps`). Um
  passo só com `title`/`description` (sem `selector`) é sempre exibido
  (centralizado) — bom para abertura/fechamento.
- Se nenhum passo com alvo estiver visível (ex.: mobile sem sidebar), o tour
  **não roda e não marca como visto** — pode aparecer depois no desktop.
- **Roteiros por papel:** registre vários `TourDef` com o mesmo `id` e rotas
  iguais, variando `roles: ["owner"]` / `["consultant"]`. O `findTour` escolhe
  pelo papel; registre os mais específicos primeiro.
- O engine **não troca de aba/rota sozinho** — ele destaca o que estiver na
  tela. Para tutoriais que cruzam telas, prefira um passo por página.

## Cobertura atual

**Painel** (`src/lib/tours/painel.ts`):
- `painel.overview` (sidebar, owner + consultant) — migrado do tour antigo.
- `painel.cursos`, `painel.vitrine`, `painel.alunos`, `painel.vendas`,
  `painel.vendas-nova`, `painel.cupons`, `painel.financeiro`,
  `painel.indicacoes`, `painel.certificados`, `painel.dominio`,
  `painel.configuracoes`.

**Aluno** (`src/lib/tours/aluno.ts`):
- `aluno.overview` (sidebar), `aluno.cursos`, `aluno.comprar`,
  `aluno.certificados`, `aluno.pagamentos`, `aluno.suporte`, `aluno.perfil`.

### Páginas ainda sem tour (secundárias / feature-gated)

Painel: `equipe`, `revendas/*`, `leads/*`, `placar`, `treinamentos/*`,
`automacao/*`, `atendimento`, `comunicacao`, `notificacoes`, `onboarding`.
Seguem o passo a passo acima quando quiser cobri-las.
