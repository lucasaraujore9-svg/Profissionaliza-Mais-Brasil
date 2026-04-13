# Issue 017 — Gestão Revendedores + Detalhe Prototype

**Tipo:** proto
**Página:** /admin/revendedores, /admin/revendedores/[id]
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de gestão de revendedores do Admin. Componentes: header busca/filtros, stats bar, tabela revendedores, página detalhe com perfil completo. Dados hardcoded.

## Componentes Envolvidos
- ResellerListHeader — titulo "Revendedores", busca por nome/email, filtros (status)
- ResellerStatsBar — 4 stats: Total, Ativos, Pendentes, Suspensos
- ResellerTable — colunas: Nome, Email, MRR, Alunos, Status, Ações (Ver, Editar, Suspender)
- ResellerProfile — página detalhe com informações completas do revendedor
- PaymentHistory — tabela histórico pagamentos Asaas
- StudentCount — card mostrando número alunos vendedor
- PolicyConfig — card com configuration: Modo Bloqueio (Auto/Manual)
- ActionButtons — botões: Suspender, Ativar, Cancelar Assinatura

## Comportamentos
- `render-reseller-list` — exibir tabela 20 revendedores
- `click-ver-detalhe` — navegar para página detalhe
- `filter-by-status` — filtrar status revendedor (visual)
- `search-resellers` — buscar por nome/email (visual)
- `render-detail-page` — exibir perfil completo revendedor

## Critério de Aceite
- [ ] ResellerListHeader com titulo, busca, filtros
- [ ] ResellerStatsBar exibe 4 números
- [ ] ResellerTable com 20 revendedores, colunas corretas
- [ ] Clicar "Ver" navega para /admin/revendedores/[id]
- [ ] ResellerProfile exibe informações completas
- [ ] PaymentHistory mostra tabela pagamentos
- [ ] StudentCount card visível
- [ ] PolicyConfig com toggle modo bloqueio
- [ ] ActionButtons presentes (Suspender, Ativar, Cancelar)
- [ ] Layout responsivo
