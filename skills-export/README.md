# Export completo de skills do Claude Cowork

Este pacote empacota TODAS as suas skills, agents e commands do Claude Cowork para importar em outra maquina.

## Inventario atual (detectado na sessao)

### Custom (exclusiva sua)
- **vibe-scaffold** — metodo SPEC -> BREAK -> PLAN -> EXECUTE (criada por voce)

### Anthropic marketplace (21 skills)
hormozi-squad · xlsx · c-level-squad · movement · setup-cowork · pptx · stitch-designer · traffic-masters · consolidate-memory · advisory-board · brand-squad · pdf · docx · cso-squad · schedule · skill-creator · data-squad · cybersecurity · copy-squad · storytelling · design-squad

### Sales plugin (9 skills)
account-research · call-prep · pipeline-review · forecast · draft-outreach · competitive-intelligence · daily-briefing · call-summary · create-an-asset

### Marketing plugin (8 skills)
content-creation · brand-review · email-sequence · competitive-brief · performance-report · campaign-plan · seo-audit · draft-content

### Operations plugin (9 skills)
vendor-review · risk-assessment · process-doc · compliance-tracking · status-report · runbook · capacity-plan · process-optimization · change-request

**Total: 48 skills**

## Como exportar (maquina de origem)

1. Abra o Terminal do Mac
2. Rode:

```bash
cd "/Users/lucas/Documents/Sites/Bolsa Mais Brasil/Profissionaliza Mais Brasil/skills-export"
chmod +x export-all-skills.sh import-all-skills.sh
./export-all-skills.sh
```

Isso gera `~/Desktop/claude-skills-export.zip` com tudo dentro.

O script varre automaticamente:
- `~/.claude/skills/` (user skills)
- `/var/folders/*/T/claude-hostloop-plugins/*/skills/` (Anthropic marketplace)
- `~/Library/Application Support/Claude/local-agent-mode-sessions/*/rpm/plugin_*/skills/` (plugins RPM)
- `~/.claude/agents/` (subagents customizados)
- `~/.claude/commands/` (slash commands globais)
- `~/.claude/settings.json` e `~/.claude.json` (config base)

Gera tambem um `MANIFEST.md` listando tudo que foi exportado.

## Como importar (maquina de destino)

1. Transfira `claude-skills-export.zip` (AirDrop, Drive, Dropbox, etc)
2. Descompacte no Desktop da maquina de destino
3. Abra Terminal e rode:

```bash
cd ~/Desktop/claude-skills-export
chmod +x import-all-skills.sh
./import-all-skills.sh
```

4. **Quit completo do Claude Cowork** (Cmd+Q, nao so fechar janela)
5. Reabra
6. Teste uma skill (ex: digite "criar estrutura basal para novo projeto SaaS" — deve disparar o vibe-scaffold)

## Alternativa: reinstalar via marketplace (mais limpo)

As skills do marketplace oficial tambem podem ser reinstaladas uma a uma via:
- Claude Cowork -> Settings -> Plugins/Marketplace
- Procurar e instalar

Use o script para garantir bit-identical copy. Use o marketplace se quiser atualizacoes automaticas.

## Troubleshooting

**"permission denied" ao rodar script:**
```bash
chmod +x *.sh
```

**Cowork nao reconhece as skills apos importar:**
- Feche 100% (Cmd+Q, nao so botao vermelho)
- Confirme que a skill esta em `~/.claude/skills/<nome>/SKILL.md`
- Verifique o frontmatter: `name:` e `description:` obrigatorios

**Conflito de nomes:**
O script nao sobrescreve skills ja existentes com mesmo nome no destino. Remova manualmente antes se quiser substituir.

## Arquivos neste pacote

- `export-all-skills.sh` — varre e empacota tudo da maquina origem
- `import-all-skills.sh` — restaura na maquina destino
- `README.md` — este arquivo
