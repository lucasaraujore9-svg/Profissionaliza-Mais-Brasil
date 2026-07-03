/**
 * LGPD-011: fonte única da versão dos documentos legais (Política de Privacidade
 * e Termos de Uso) e da versão de consentimento gravada nos leads.
 *
 * Antes havia três strings hardcoded divergentes ("2026-05-v1"/"2026-06-v1") nas
 * rotas de lead, que não correspondiam à versão pública exibida ao titular
 * ("1.3"). Centralizar aqui garante que o `consentVersion` persistido rastreie
 * para a versão real/datada do documento apresentado.
 *
 * Ao publicar uma nova versão dos documentos, bump aqui (e a data correspondente).
 */
export const LEGAL_VERSION = "1.3"

/** Data de atualização exibida na Política de Privacidade. */
export const PRIVACY_UPDATED_AT = "10 de junho de 2026"

/** Data de atualização exibida nos Termos de Uso. */
export const TERMS_UPDATED_AT = "11 de junho de 2026"

/**
 * Versão do consentimento gravada em `StudentLead.consentVersion` /
 * `Lead`-equivalente — atrelada à versão pública dos documentos.
 */
export const CONSENT_VERSION = LEGAL_VERSION
