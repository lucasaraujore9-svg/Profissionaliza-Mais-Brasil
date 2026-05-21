# Issue 029 — Email Templates + Resend Integration

**Tipo:** infra
**Página:** global
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Implementar React Email templates e integração Resend. Templates: welcome (revendedor), reset password, enrollment confirmation, payment received. Variáveis templates, preview HTML, send function.

## Componentes Envolvidos
- lib/email/ — templates React Email
- lib/email/templates/welcome.tsx — welcome revendedor
- lib/email/templates/reset-password.tsx — reset password
- lib/email/templates/enrollment.tsx — enrollment confirmation
- lib/email/templates/payment.tsx — payment received notification
- lib/email/resend.ts — Resend integration (send function)

## Comportamentos
- `render-template` — React Email renderiza template
- `send-email` — Resend API send com template
- `preview-html` — gerar HTML preview local
- `variable-substitution` — templates com {{variável}}

## Critério de Aceite
- [ ] React Email templates criadas para 4 tipos
- [ ] WelcomeTemplate com logo, greeting, próximos passos
- [ ] ResetPasswordTemplate com link reset + expiration
- [ ] EnrollmentTemplate com curso, acesso plataforma, CTA
- [ ] PaymentTemplate com valor, comprovante, CTA
- [ ] lib/email/resend.ts com sendEmail function
- [ ] RESEND_API_KEY em .env
- [ ] sendEmail(to, template, variables) API
- [ ] Error handling falha Resend
- [ ] Preview HTML em desenvolvimento
- [ ] Todas templates responsive mobile/desktop
