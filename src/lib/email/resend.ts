// Re-export por compatibilidade com imports legados. A implementação real
// vive em `./mailer.ts` (suporta SMTP/Hostinger + Resend como fallback).
export {
  sendEmail,
  renderTemplateHtml,
  EmailError,
  type EmailTemplate,
} from "./mailer"
