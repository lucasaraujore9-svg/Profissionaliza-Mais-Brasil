# Issue 013 — Config Domínio Prototype

**Tipo:** proto
**Página:** /painel/dominio
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de configuração de domínio do revendedor. Componentes: display subdomínio atual, form adicionar domínio custom, status domínio, instruções DNS, botão verificar. Dados hardcoded.

## Componentes Envolvidos
- SubdomainDisplay — card exibindo subdomínio atual (ex: "minhaempresa.profissionalizamaisbrasil.com.br")
- CustomDomainForm — inputs: domínio custom (ex: "meuloja.com.br"), botão "Adicionar"
- DomainStatus — status domínio: Ativo (green), Pendente (yellow), Erro (red)
- DNSInstructions — instruções para configurar DNS (CNAME, A record)
- VerifyButton — botão "Verificar Domínio"
- DomainRemoveButton — botão "Remover Domínio" com confirmação visual

## Comportamentos
- `render-domain-config` — exibir página
- `input-custom-domain` — aceitar input domínio
- `click-verify` — botão verificação clicável
- `toggle-dns-instructions` — expandir/colapsar instruções
- `click-remove` — mostrar confirmação visual

## Critério de Aceite
- [ ] SubdomainDisplay exibe subdomínio hardcoded
- [ ] CustomDomainForm com input domínio
- [ ] DomainStatus mostra status visualmente (cores)
- [ ] DNSInstructions colapsável com instruções CNAME
- [ ] VerifyButton presente e clicável
- [ ] DomainRemoveButton com confirmação visual
- [ ] Layout limpo e informativo
- [ ] Tipografia clara
