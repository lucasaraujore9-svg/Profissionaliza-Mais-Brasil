#!/usr/bin/env bash
# import-all-skills.sh
# Restaura skills/agentes/comandos exportados por export-all-skills.sh em uma nova maquina.
#
# Uso:
#   1. Descompacte claude-skills-export.zip no Desktop
#   2. cd ~/Desktop/claude-skills-export
#   3. chmod +x import-all-skills.sh
#   4. ./import-all-skills.sh
#   5. Reinicie o Claude Cowork

set -euo pipefail

SRC_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "==> Importando de $SRC_DIR"

mkdir -p "$HOME/.claude/skills" "$HOME/.claude/agents" "$HOME/.claude/commands"

# ------------------------------------------------------------
# 1. User skills
# ------------------------------------------------------------
if [ -d "$SRC_DIR/user-skills" ]; then
  echo "==> Copiando user skills para ~/.claude/skills/..."
  cp -R "$SRC_DIR/user-skills/." "$HOME/.claude/skills/"
fi

# ------------------------------------------------------------
# 2. Anthropic marketplace skills
# Copia para ~/.claude/skills tambem — funcionam como user skills.
# (O marketplace oficial tambem vai reinstalar automaticamente, mas isso garante redundancia.)
# ------------------------------------------------------------
if [ -d "$SRC_DIR/anthropic-skills" ]; then
  echo "==> Copiando Anthropic skills para ~/.claude/skills/..."
  for plugin_dir in "$SRC_DIR/anthropic-skills"/*/; do
    if [ -d "$plugin_dir" ]; then
      # Copia cada skill individual para ~/.claude/skills
      for skill_dir in "$plugin_dir"*/; do
        if [ -f "$skill_dir/SKILL.md" ]; then
          skill_name=$(basename "$skill_dir")
          cp -R "$skill_dir" "$HOME/.claude/skills/$skill_name"
        fi
      done
    fi
  done
fi

# ------------------------------------------------------------
# 3. RPM plugins
# ------------------------------------------------------------
if [ -d "$SRC_DIR/rpm-plugins" ]; then
  echo "==> Copiando RPM plugin skills para ~/.claude/skills/..."
  for plugin_dir in "$SRC_DIR/rpm-plugins"/*/skills/; do
    if [ -d "$plugin_dir" ]; then
      for skill_dir in "$plugin_dir"*/; do
        if [ -f "$skill_dir/SKILL.md" ]; then
          skill_name=$(basename "$skill_dir")
          # Prefixa com o tipo de plugin para evitar conflito (ex: sales-account-research)
          parent_plugin=$(basename "$(dirname "$plugin_dir")")
          target="$HOME/.claude/skills/$skill_name"
          if [ ! -d "$target" ]; then
            cp -R "$skill_dir" "$target"
          fi
        fi
      done
    fi
  done
fi

# ------------------------------------------------------------
# 4. Agents e commands
# ------------------------------------------------------------
if [ -d "$SRC_DIR/agents" ]; then
  cp -R "$SRC_DIR/agents/." "$HOME/.claude/agents/" 2>/dev/null || true
fi
if [ -d "$SRC_DIR/commands" ]; then
  cp -R "$SRC_DIR/commands/." "$HOME/.claude/commands/" 2>/dev/null || true
fi

echo ""
echo "==> Importado com sucesso."
echo ""
echo "Skills instaladas em ~/.claude/skills:"
ls "$HOME/.claude/skills/" | sed 's/^/  - /'
echo ""
echo "Agora:"
echo "  1. Feche completamente o Claude Cowork (Cmd+Q)"
echo "  2. Reabra"
echo "  3. Teste invocando uma skill (ex: 'quero criar estrutura basal de projeto' para vibe-scaffold)"
