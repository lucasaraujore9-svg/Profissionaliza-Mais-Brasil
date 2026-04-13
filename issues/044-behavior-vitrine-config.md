# Issue 044 — Config Vitrine: Personalização + Preview

**Tipo:** behavior
**Página:** /painel/vitrine
**Depende de:** 014, 028
**Prioridade:** P1

## O Que Fazer

Implementar configuração vitrine: upload logo/banner, color pickers, customizar textos, preview em tempo real, invalidar cache Redis ao salvar.

## Componentes Envolvidos
- GET /api/painel/vitrine — carregar config vitrine
- PUT /api/painel/vitrine — salvar config
- POST /api/painel/vitrine/upload — upload logo/banner (Supabase Storage)
- lib/redis invalidate cache ao atualizar

## Comportamentos
- `load-vitrine-config` — GET /api/painel/vitrine
- `upload-logo` — POST multipart logo para Supabase Storage
- `upload-banner` — POST multipart banner para Supabase Storage
- `update-colors` — PUT /api/painel/vitrine { primary_color, secondary_color, ... }
- `update-texts` — PUT /api/painel/vitrine { shop_name, description, ... }
- `invalidate-cache` — Redis invalidate tenant cache
- `preview-live` — LivePreview atualiza em tempo real

## Critério de Aceite
- [ ] GET /api/painel/vitrine implementado
- [ ] Retorna { logo_url, banner_url, colors: { primary, secondary, ... }, texts: { name, description } }
- [ ] LogoUpload drag-drop funciona
- [ ] POST /api/painel/vitrine/upload salva em Supabase Storage
- [ ] Retorna storage URL, atualiza Tenant.logo_url
- [ ] BannerUpload drag-drop funciona
- [ ] ColorPickers atualizam preview
- [ ] PUT /api/painel/vitrine salva cores/textos
- [ ] Atualiza Tenant.primary_color, secondary_color, shop_name, description
- [ ] Invalida Redis cache tenant:config:{tenant_id}
- [ ] LivePreview renderiza mudanças em tempo real
