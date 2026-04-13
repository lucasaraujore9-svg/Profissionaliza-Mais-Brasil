# Issue 033 — Auth: Login + Forgot Password

**Tipo:** behavior
**Página:** /login, /forgot-password, /reset-password
**Depende de:** 004, 022, 029
**Prioridade:** P0

## O Que Fazer

Implementar fluxo autenticação completo: login com credenciais, forgot password com envio link reset, reset password com nova senha, validação inputs.

## Componentes Envolvidos
- LoginForm (do proto 004) + NextAuth credentials
- ForgotForm (do proto 004) + email send
- ResetPasswordForm (novo)
- POST /api/auth/forgot-password — enviar email reset
- POST /api/auth/reset-password — validar token e atualizar senha
- NextAuth signin do login form

## Comportamentos
- `do-login` — NextAuth signin com email/password
- `show-error-invalid-credentials` — exibir erro credenciais inválidas
- `request-password-reset` — POST /api/auth/forgot-password
- `send-reset-email` — Resend email com link reset
- `validate-reset-token` — verificar token expirado
- `update-password` — atualizar password hashed no DB
- `redirect-after-reset` — redirecionar /login após sucesso

## Critério de Aceite
- [ ] LoginForm email + password validado
- [ ] NextAuth signin({ email, password }) via credentials provider
- [ ] Role-based redirect (ADMIN → /admin, RESELLER → /painel, STUDENT → /loja)
- [ ] Error message "Email ou senha inválidos"
- [ ] Link "Esqueci senha" → /forgot-password
- [ ] ForgotForm email input
- [ ] POST /api/auth/forgot-password { email }
- [ ] Query User por email, gerar token reset aleatório, save em db
- [ ] Email reset com link: /reset-password?token=XXX
- [ ] ResetPasswordForm com nova senha e confirmação
- [ ] POST /api/auth/reset-password { token, password }
- [ ] Validar token não expirado (5 minutos)
- [ ] Hash password, save no DB
- [ ] Redirect /login com mensagem sucesso
- [ ] Login agora funciona com nova senha
