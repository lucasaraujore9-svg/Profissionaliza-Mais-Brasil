# DEPRECATED — Use /plan, /execute, /status, /next, /review instead

Este arquivo e legado. Os comandos foram refatorados para seguir o workflow SPEC→BREAK→PLAN→EXECUTE:

- **/setup** — Inicializar projeto do zero
- **/plan** — Planejar uma issue antes de executar
- **/execute** — Executar uma issue planejada
- **/status** — Ver status do projeto
- **/next** — Sugerir proxima issue para executar
- **/review** — Revisar codigo de uma issue completada

Nao use este arquivo. Ele foi substituido.

### 3. Gestao de Cursos / Precificacao (Tela 3.2)
Criar `src/app/painel/cursos/page.tsx`:
- Lista de cursos disponiveis (do catalogo master)
- Para cada: toggle visibilidade, preco editavel, tipo pagamento (unico/mensal)
- Drawer lateral para editar detalhes
- CRUD via API routes: /api/tenants/[id]/courses

### 4. Gestao de Alunos (Tela 3.3)
Criar `src/app/painel/alunos/page.tsx`:
- Tabela: nome, email, curso, status (badge colorido), progresso, acoes
- Busca por nome/email/CPF
- Filtros: status, curso
- Drawer de detalhes do aluno com historico
- Acoes: bloquear/desbloquear (chama plataforma usuarios/editar), enviar mensagem

### 5. Gestao de Cupons (Tela 3.4)
Criar `src/app/painel/cupons/page.tsx`:
- Grid de cupons ativos com: codigo, desconto, usos, validade
- Modal "Novo Cupom": codigo (auto-generate), tipo desconto, valor, max usos, datas
- Toggle ativar/desativar
- CRUD via /api/coupons

### 6. Financeiro Revendedor (Tela 3.5)
Criar `src/app/painel/financeiro/page.tsx`:
- Cards: Receita Bruta, Liquida, Ticket Medio, Inadimplencia %
- Grafico de barras mensal
- Tabela de pagamentos: aluno, curso, valor, forma, status, data
- Filtros: periodo, status, forma de pagamento
- Exportar CSV

### 7. Config de Dominio (Tela 3.6)
Criar `src/app/painel/dominio/page.tsx`:
- Exibir subdominio atual (automatico)
- Input para dominio custom + botao "Adicionar"
- Status: Aguardando DNS / Verificado / Erro
- Instrucoes de CNAME
- Botao "Verificar DNS"
- Integrar com Vercel API (docs/architecture/DOMINIOS-GUIDE.md)

### 8. Config da Vitrine
Criar `src/app/painel/vitrine/page.tsx`:
- Upload de logo
- Cores: primary, secondary (color picker)
- Banner: upload de imagem
- Tagline e descricao
- WhatsApp, Instagram, Facebook
- Preview ao vivo

### 9. Configuracoes
Criar `src/app/painel/configuracoes/page.tsx`:
- Dados da conta (nome, email, telefone)
- Modo de cobranca: toggle AUTO/MANUAL
- Conexao Mercado Pago: botao conectar, status, access_token mascarado
- Alterar senha

---

## TAREFAS — PAINEL ADMIN MASTER

### 10. Layout Admin
Criar `src/app/admin/layout.tsx`:
- Sidebar: Dashboard, Revendedores, Catalogo, Financeiro, Analytics, Config
- Diferenciar visualmente do painel revendedor (acento azul mais escuro)
- Proteger: SUPER_ADMIN ou ADMIN role

### 11. Dashboard Admin (Tela 4.1)
Criar `src/app/admin/page.tsx`:
- Cards: Receita Total (MRR), Revendedores Ativos, Total Alunos, Cursos Vendidos
- Grafico dual: receita mensalidades + receita total alunos
- Top 10 revendedores por receita
- Alertas: pagamentos vencidos, aprovacoes pendentes

### 12. Gestao de Revendedores (Tela 4.2)
Criar `src/app/admin/revendedores/page.tsx`:
- Tabela: nome, slug, plano, mensalidade, status, alunos, ultimo pagamento
- Filtros: status, plano
- Acoes: ver detalhes, suspender, ativar, cancelar

Criar `src/app/admin/revendedores/[id]/page.tsx`:
- Perfil completo do revendedor
- Historico de pagamentos Asaas
- Contagem de alunos e receita gerada
- Link preview da vitrine
- Config individual: billing_mode, cancellation_policy
- Botoes: suspender/ativar/cancelar (com dialogo de confirmacao)

### 13. Financeiro Admin (Tela 4.3)
Criar `src/app/admin/financeiro/page.tsx`:
- MRR, Taxa Inadimplencia, Churn, LTV
- Lista de pagamentos dos revendedores (Asaas)
- Secao de inadimplentes destacada

### 14. Catalogo Master (Tela 4.4)
Criar `src/app/admin/catalogo/page.tsx`:
- Grid de cursos sincronizados da plataforma
- Botao "Sincronizar Agora" (chama cron manualmente)
- Ultimo sync + resultado
- Cursos sao read-only (vem da plataforma)

### 15. Analytics Global (Tela 4.5)
Criar `src/app/admin/analytics/page.tsx`:
- Filtros: periodo, revendedor
- KPIs: matriculas, cursos mais vendidos, ticket medio, conversao
- Graficos: vendas por categoria, crescimento alunos, top revendedores, formas pagamento
- Ranking de revendedores

### 16. Verificacao
- Login como revendedor → painel completo funcional
- Login como admin → painel admin funcional
- Bloquear aluno via painel → checar que plataforma foi chamada
- Criar cupom → aplicar na vitrine → funcionar
- Adicionar dominio custom → instrucoes DNS corretas

### COMMIT
```bash
git add . && git commit -m "feat: reseller panel + admin panel — complete management"
```
