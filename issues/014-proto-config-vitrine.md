# Issue 014 — Config Vitrine Prototype

**Tipo:** proto
**Página:** /painel/vitrine
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de personalização da vitrine do revendedor. Componentes: upload logo/banner, color pickers, text fields, live preview. Dados hardcoded, preview atualiza visualmente.

## Componentes Envolvidos
- LogoUpload — drag-drop ou file input para logo (exibe preview)
- ColorPickers — 3 color pickers: Cor Primária, Cor Secundária, Cor Acentos
- BannerUpload — drag-drop para imagem hero banner
- TextFields — inputs: Nome Loja, Descrição, Rodapé customizado
- LivePreview — preview em tempo real das mudanças (lado direito desktop)
- SaveButton — botão "Salvar Mudanças"

## Comportamentos
- `render-config-page` — exibir form e preview
- `upload-logo` — arrastar/clicar para upload logo
- `upload-banner` — arrastar/clicar para upload banner
- `change-color` — color picker atualiza preview
- `update-text` — texto atualiza em preview
- `save-changes-mock` — botão salvável mas sem persistência

## Critério de Aceite
- [ ] LogoUpload com drag-drop zone e preview
- [ ] ColorPickers para 3 cores principais
- [ ] BannerUpload com drag-drop zone
- [ ] TextFields com inputs nome, descrição, rodapé
- [ ] LivePreview mostra mudanças em tempo real
- [ ] Ao mudar cor, preview atualiza
- [ ] Ao mudar texto, preview atualiza
- [ ] SaveButton presente
- [ ] Layout responsivo (form esquerda, preview direita desktop)
- [ ] Tipografia e cores corretas
