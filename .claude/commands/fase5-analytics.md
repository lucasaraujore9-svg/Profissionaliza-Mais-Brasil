# DEPRECATED — Use /plan, /execute, /status, /next, /review instead

Este arquivo e legado. Os comandos foram refatorados para seguir o workflow SPEC→BREAK→PLAN→EXECUTE:

- **/setup** — Inicializar projeto do zero
- **/plan** — Planejar uma issue antes de executar
- **/execute** — Executar uma issue planejada
- **/status** — Ver status do projeto
- **/next** — Sugerir proxima issue para executar
- **/review** — Revisar codigo de uma issue completada

Nao use este arquivo. Ele foi substituido.
- Crescimento de alunos ao longo do tempo (line chart)
- Top revendedores por vendas, alunos, ticket medio
- Vendas por forma de pagamento (donut)
- Taxa de conclusao de cursos (via plataforma cursosvinculados)
- Horarios de pico de vendas (heatmap)

### 3. Landing Page Principal (Tela 1.1)
Criar `src/app/page.tsx`:
- Navbar: logo PMB, links (Como Funciona, Cursos, Planos), CTA "Seja Revendedor"
- Hero split: headline + mockup da vitrine
- Como funciona: timeline 3 passos
- Numeros: bento grid com metricas reais do banco
- Preview catalogo: scroll horizontal por categorias
- Planos de revenda
- Depoimentos
- Footer

### 4. Pagina "Seja Revendedor" (Tela 1.2)
Criar `src/app/(main)/seja-revendedor/page.tsx`:
- Beneficios em zig-zag
- Timeline detalhada do processo
- Planos e precos
- FAQ accordion
- Formulario de interesse (nome, email, whatsapp, cidade)

### 5. Checkout de Adesao (Asaas)
Criar `src/app/(main)/seja-revendedor/checkout/page.tsx`:
- Formulario completo de cadastro do revendedor
- Selecao de plano
- Integrar com Asaas: criar customer + subscription
- Redirect para pagamento (pix/boleto/cartao)
- Webhook Asaas ativa a conta

### 6. Onboarding Wizard do Revendedor
Criar `src/app/painel/onboarding/page.tsx`:
- Step 1: Dados da empresa (nome, CNPJ/CPF)
- Step 2: Personalizar vitrine (logo, cores, banner)
- Step 3: Conectar Mercado Pago
- Step 4: Configurar precos dos cursos
- Step 5: Revisar e publicar vitrine
- Barra de progresso
- Skip e voltar entre steps

### 7. Email Templates
Criar com React Email em `emails/`:
- `welcome-reseller.tsx` — Boas-vindas ao revendedor + proximos passos
- `welcome-student.tsx` — Boas-vindas ao aluno + credenciais
- `payment-reminder.tsx` — Lembrete de pagamento
- `reseller-overdue.tsx` — Aviso de inadimplencia ao admin
- `student-blocked.tsx` — Aviso de bloqueio ao aluno

### 8. SEO e Meta Tags
- Gerar meta tags dinamicas por tenant (Open Graph, Twitter)
- Sitemap dinamico por tenant
- robots.txt
- Structured data (Course schema)

### 9. Testes End-to-End
Testar todos os fluxos:
- [ ] Revendedor se cadastra → paga Asaas → conta ativada
- [ ] Revendedor configura vitrine → publica
- [ ] Aluno acessa vitrine → escolhe curso → aplica cupom → checkout MP
- [ ] Pagamento aprovado → aluno matriculado na plataforma → email enviado
- [ ] Aluno inadimplente → bloqueio automatico/manual
- [ ] Revendedor inadimplente → admin notificado → suspensao
- [ ] Dominio custom → DNS → verificacao → vitrine funcional
- [ ] Cron sync cursos → catalogo atualizado

### 10. Preparacao para Deploy
- Configurar dominios na Vercel (principal + wildcard)
- Configurar DNS no Registro.br
- Configurar webhooks reais (Asaas + MP)
- Configurar cron jobs na Vercel
- Testar SSL em todos os dominios
- Configurar Supabase em producao
- Configurar Upstash Redis em producao
- Setar todas as env vars na Vercel

### COMMIT
```bash
git add . && git commit -m "feat: analytics, landing page, onboarding, emails — ready for production"
```
