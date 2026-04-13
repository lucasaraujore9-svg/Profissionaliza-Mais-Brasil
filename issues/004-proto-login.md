# Issue 004 — Login + Forgot Password Prototype

**Tipo:** proto
**Página:** /login, /forgot-password
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar páginas de login e recuperação de senha. Componentes: form login, form reset password, estado de confirmação. UI com brand panel lateral (desktop).

## Componentes Envolvidos
- LoginForm — inputs email, password, "Lembrar-me" checkbox, botão "Entrar", link "Esqueci senha"
- ForgotForm — input email, botão "Enviar Reset", link "Voltar para login"
- BrandPanel — painel lateral com logo, headline, imagem destaque (desktop only)
- ConfirmationState — mensagem "Email enviado com sucesso"

## Comportamentos
- `render-login-form` — exibir formulário login
- `click-forgot-password-link` — navegar para /forgot-password
- `click-back-to-login` — voltar de /forgot-password para /login
- `submit-form-mock` — form pode ser clicado mas não submete

## Critério de Aceite
- [ ] LoginForm renderiza com inputs email, password, checkbox
- [ ] Link "Esqueci senha" visível em LoginForm
- [ ] Botão "Entrar" estilizado e clicável (sem submissão real)
- [ ] ForgotForm renderiza com input email
- [ ] Link "Voltar para login" em ForgotForm
- [ ] BrandPanel renderiza em desktop com logo e imagem
- [ ] ConfirmationState mostra quando em /forgot-password?success=true (mock)
- [ ] Layout responsivo (mobile stack, desktop side-by-side)
- [ ] Tipografia e cores seguem design system
