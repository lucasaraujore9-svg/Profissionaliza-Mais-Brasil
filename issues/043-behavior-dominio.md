# Issue 043 — Config Domínio: Gerenciar Domínio Custom

**Tipo:** behavior
**Página:** /painel/dominio
**Depende de:** 013, 020
**Prioridade:** P1

## O Que Fazer

Implementar configuração de domínio: exibir subdomínio atual, adicionar domínio custom via Vercel API, verificar DNS, remover domínio. Integração Vercel.

## Componentes Envolvidos
- GET /api/painel/dominio — carregar config domínio atual
- POST /api/painel/dominio — adicionar domínio custom (Vercel API)
- POST /api/painel/dominio/verify — verificar DNS (Vercel API)
- DELETE /api/painel/dominio — remover domínio custom
- Vercel API client para domain management

## Comportamentos
- `render-domain-config` — GET /api/painel/dominio
- `add-custom-domain` — POST /api/painel/dominio { domain }
- `verify-dns` — POST /api/painel/dominio/verify (Vercel API check)
- `remove-domain` — DELETE /api/painel/dominio com confirmação
- `update-status` — status domínio (Ativo, Pendente, Erro)

## Critério de Aceite
- [ ] GET /api/painel/dominio implementado
- [ ] Retorna { subdomain, custom_domain, status, dns_records }
- [ ] SubdomainDisplay exibe subdomínio atual
- [ ] CustomDomainForm input domínio
- [ ] POST /api/painel/dominio { domain } -> chama Vercel API
- [ ] Vercel adiciona domínio ao projeto
- [ ] Atualiza Tenant.custom_domain
- [ ] DomainStatus exibe status atual
- [ ] DNSInstructions mostra CNAME correct
- [ ] POST /api/painel/dominio/verify chama Vercel API
- [ ] Verifica CNAME propagação
- [ ] DELETE /api/painel/dominio remove domínio (Vercel + DB)
