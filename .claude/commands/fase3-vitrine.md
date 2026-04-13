# DEPRECATED — Use /plan, /execute, /status, /next, /review instead

Este arquivo e legado. Os comandos foram refatorados para seguir o workflow SPEC→BREAK→PLAN→EXECUTE:

- **/setup** — Inicializar projeto do zero
- **/plan** — Planejar uma issue antes de executar
- **/execute** — Executar uma issue planejada
- **/status** — Ver status do projeto
- **/next** — Sugerir proxima issue para executar
- **/review** — Revisar codigo de uma issue completada

Nao use este arquivo. Ele foi substituido.
- Grid de cursos (3 cols desktop, 2 tablet, 1 mobile)
- Card de curso: capa, titulo, categoria badge, preco, CTA
- Cursos destacados (is_featured) no topo
- Server Component: buscar cursos do tenant com cache

Criar `src/components/loja/course-card.tsx`
Criar `src/components/loja/category-filter.tsx`
Criar `src/components/loja/hero-banner.tsx`

### 3. Pagina do Curso (Tela 2.2)
Criar `src/app/loja/curso/[slug]/page.tsx`:
- Breadcrumb: Home > Categoria > Curso
- Split layout: imagem + info (titulo, descricao, preco, CTA)
- Preco em fonte Mono grande
- Campo de cupom inline
- Secao "Sobre o Curso" (descricao da API EA)
- Ementa: accordion com lista de aulas (API EA cursos/aulas)
- Stats: aulas, carga horaria, certificado
- CTA sticky no mobile

Criar `src/components/loja/course-detail.tsx`
Criar `src/components/loja/lesson-accordion.tsx`
Criar `src/components/loja/coupon-field.tsx`

### 4. Sistema de Cupons
Criar `src/app/api/coupons/validate/route.ts`:
- POST: recebe {code, tenantId, courseId}
- Valida: existe, ativo, nao expirado, nao excedeu max_uses, pertence ao tenant
- Retorna: desconto calculado (percentual ou fixo)

Integrar no coupon-field.tsx:
- Input + botao "Aplicar"
- Mostra desconto aplicado ou erro
- Atualiza preco exibido

### 5. Checkout (Tela 2.3)
Criar `src/app/loja/checkout/page.tsx`:
- Recebe curso_id e coupon_code via searchParams
- Layout 2 colunas: resumo do pedido + formulario
- Formulario: Nome, Email, Telefone, CPF
- Resumo: curso, preco original, desconto, valor final
- Info: "Voce sera redirecionado ao Mercado Pago"
- Botao "Finalizar Compra"

Criar `src/app/api/payments/create-preference/route.ts`:
- Recebe dados do formulario + curso + cupom
- Valida tudo com Zod
- Cria student no banco (status PENDING)
- Cria enrollment no banco (status PENDING)
- Busca mp_access_token do tenant (decrypt)
- Cria preferencia no Mercado Pago
- Retorna init_point (URL do MP)

Criar `src/app/api/payments/create-subscription/route.ts`:
- Mesmo fluxo, mas para cursos mensais
- Usa preapproval do MP

### 6. Confirmacao (Tela 2.4)
Criar `src/app/loja/confirmacao/page.tsx`:
- Pagina de sucesso apos retorno do MP
- Icone de check, "Matricula confirmada!"
- Detalhes: curso, nome do aluno
- Instrucoes: verificar email, acessar plataforma
- Link "Voltar para a vitrine"

### 7. Fluxo Completo de Matricula (no webhook)
Garantir que o webhook do MP (criado na fase 2) executa:
1. Valida pagamento aprovado
2. Cria aluno na EA (usuarios/novo com polo e vendedor)
3. Vincula curso na EA (usuarios/vinculocurso com idcurso)
4. Envia email de credenciais (usuarios/envioemail)
5. Atualiza student e enrollment no banco (status ACTIVE)

### 8. Verificacao
- Navegar vitrine como aluno
- Ver catalogo, abrir curso, aplicar cupom
- Ir para checkout, preencher dados
- Redirecionar para MP (sandbox)
- Webhook processar e matricular
- Pagina de confirmacao exibir corretamente

### COMMIT
```bash
git add . && git commit -m "feat: storefront — catalog, course page, checkout, enrollment flow"
```
