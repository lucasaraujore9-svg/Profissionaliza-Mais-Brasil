# Como instalar a skill `vibe-scaffold`

Esta skill empacota o metodo SPEC -> BREAK -> PLAN -> EXECUTE com todos os templates (CLAUDE.md, SPEC.md, issues, docs de referencia, slash commands) para reproduzir a qualidade do Profissionaliza Mais Brasil em qualquer projeto novo.

## Opcao A — Instalar globalmente no Claude Code (recomendado)

Skills de usuario ficam em `~/.claude/skills/`. Rode no terminal:

```bash
mkdir -p ~/.claude/skills
cp -R "/Users/lucas/Documents/Sites/Bolsa Mais Brasil/Profissionaliza Mais Brasil/.claude-skills/vibe-scaffold" ~/.claude/skills/
```

Reinicie o Claude Code. A skill fica disponivel em QUALQUER projeto.

## Opcao B — Instalar no Cowork (plugins de usuario)

```bash
mkdir -p ~/Library/Application\ Support/Claude/plugins/user-skills/
cp -R "/Users/lucas/Documents/Sites/Bolsa Mais Brasil/Profissionaliza Mais Brasil/.claude-skills/vibe-scaffold" ~/Library/Application\ Support/Claude/plugins/user-skills/
```

## Opcao C — Usar por projeto (escopo local)

Copie a pasta `vibe-scaffold/` para `.claude/skills/` na raiz de cada projeto onde quiser usa-la.

## Como usar

Em uma conversa nova, diga algo como:

- "Quero criar um novo SaaS de gestao financeira — use a estrutura basal"
- "Scaffold de projeto novo: app de agendamento para clinicas"
- "Bootstrap com CLAUDE.md + issues + slash commands, app e-commerce B2B"

A skill dispara sozinha, faz a entrevista em 5 rodadas e gera:

```
<projeto>/
├── CLAUDE.md
├── README.md
├── .env.example
├── .gitignore
├── .claude/
│   ├── settings.json
│   └── commands/ (setup, plan, execute, status, next, review)
├── docs/
│   ├── SPEC.md
│   └── references/ (architecture, design-system, workflow)
└── issues/
    ├── README.md
    ├── template.md
    └── 3 issues de exemplo
```

## Teste rapido

Apos instalar, abra o Claude em um diretorio vazio e escreva:

> "Criar estrutura basal para um novo projeto SaaS chamado Teste"

Se a skill disparar e comecar a entrevista, instalacao OK.
