#!/usr/bin/env bash
# export-all-skills.sh
# Empacota TODAS as skills e agentes do Claude Cowork / Claude Code desta maquina.
# Gera um zip portable em ~/Desktop/claude-skills-export.zip.
#
# Uso:
#   chmod +x export-all-skills.sh
#   ./export-all-skills.sh

set -euo pipefail

OUT_DIR="$HOME/Desktop/claude-skills-export"
OUT_ZIP="$HOME/Desktop/claude-skills-export.zip"

echo "==> Limpando export anterior..."
rm -rf "$OUT_DIR" "$OUT_ZIP"
mkdir -p "$OUT_DIR"/{user-skills,anthropic-skills,rpm-plugins,agents,commands,manifests}

# ------------------------------------------------------------
# 1. Skills de usuario (~/.claude/skills)
# ------------------------------------------------------------
if [ -d "$HOME/.claude/skills" ]; then
  echo "==> Copiando ~/.claude/skills/..."
  cp -R "$HOME/.claude/skills/." "$OUT_DIR/user-skills/" 2>/dev/null || true
fi

# ------------------------------------------------------------
# 2. Skills da Anthropic (cache temp dos plugins oficiais)
# ------------------------------------------------------------
TMP_PLUGINS_ROOT="$(ls -d /var/folders/*/*/T/claude-hostloop-plugins 2>/dev/null | head -1 || true)"
if [ -n "$TMP_PLUGINS_ROOT" ] && [ -d "$TMP_PLUGINS_ROOT" ]; then
  echo "==> Copiando Anthropic skills de $TMP_PLUGINS_ROOT..."
  for plugin_dir in "$TMP_PLUGINS_ROOT"/*/; do
    if [ -d "${plugin_dir}skills" ]; then
      plugin_id=$(basename "$plugin_dir")
      mkdir -p "$OUT_DIR/anthropic-skills/$plugin_id"
      cp -R "${plugin_dir}skills/." "$OUT_DIR/anthropic-skills/$plugin_id/" 2>/dev/null || true
    fi
  done
fi

# ------------------------------------------------------------
# 3. Plugins RPM (sales, marketing, operations)
# ------------------------------------------------------------
RPM_ROOT="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"
if [ -d "$RPM_ROOT" ]; then
  echo "==> Procurando plugins RPM em sessions..."
  find "$RPM_ROOT" -type d -name "plugin_*" 2>/dev/null | while read -r plugin_dir; do
    plugin_name=$(basename "$plugin_dir")
    if [ -d "$plugin_dir/skills" ]; then
      target="$OUT_DIR/rpm-plugins/$plugin_name"
      mkdir -p "$target"
      cp -R "$plugin_dir/skills" "$target/" 2>/dev/null || true
    fi
  done
fi

# ------------------------------------------------------------
# 4. Agents e comandos (~/.claude/agents, ~/.claude/commands)
# ------------------------------------------------------------
[ -d "$HOME/.claude/agents" ] && cp -R "$HOME/.claude/agents/." "$OUT_DIR/agents/" 2>/dev/null || true
[ -d "$HOME/.claude/commands" ] && cp -R "$HOME/.claude/commands/." "$OUT_DIR/commands/" 2>/dev/null || true

# ------------------------------------------------------------
# 5. settings.json (config base)
# ------------------------------------------------------------
[ -f "$HOME/.claude/settings.json" ] && cp "$HOME/.claude/settings.json" "$OUT_DIR/manifests/settings.json" 2>/dev/null || true
[ -f "$HOME/.claude.json" ] && cp "$HOME/.claude.json" "$OUT_DIR/manifests/claude.json" 2>/dev/null || true

# ------------------------------------------------------------
# 6. Gerar manifesto
# ------------------------------------------------------------
MANIFEST="$OUT_DIR/manifests/MANIFEST.md"
{
  echo "# Manifesto de skills exportadas"
  echo ""
  echo "Gerado em: $(date)"
  echo "Maquina origem: $(hostname)"
  echo "Usuario: $(whoami)"
  echo ""
  echo "## User skills (~/.claude/skills)"
  ls "$OUT_DIR/user-skills/" 2>/dev/null | sed 's/^/- /'
  echo ""
  echo "## Anthropic skills (marketplace oficial)"
  find "$OUT_DIR/anthropic-skills" -mindepth 2 -maxdepth 2 -type d 2>/dev/null | sed 's|.*/||' | sort -u | sed 's/^/- /'
  echo ""
  echo "## RPM plugins"
  ls "$OUT_DIR/rpm-plugins/" 2>/dev/null | sed 's/^/- /'
  echo ""
  echo "## Agents"
  ls "$OUT_DIR/agents/" 2>/dev/null | sed 's/^/- /'
  echo ""
  echo "## Commands globais"
  ls "$OUT_DIR/commands/" 2>/dev/null | sed 's/^/- /'
} > "$MANIFEST"

echo ""
echo "==> Manifesto gerado em $MANIFEST"
cat "$MANIFEST"

# ------------------------------------------------------------
# 7. Copia o import script junto
# ------------------------------------------------------------
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -f "$SCRIPT_DIR/import-all-skills.sh" ]; then
  cp "$SCRIPT_DIR/import-all-skills.sh" "$OUT_DIR/import-all-skills.sh"
  chmod +x "$OUT_DIR/import-all-skills.sh"
fi
if [ -f "$SCRIPT_DIR/README.md" ]; then
  cp "$SCRIPT_DIR/README.md" "$OUT_DIR/README.md"
fi

# ------------------------------------------------------------
# 8. Zipar
# ------------------------------------------------------------
echo ""
echo "==> Zipando..."
cd "$HOME/Desktop"
zip -r claude-skills-export.zip claude-skills-export > /dev/null
echo ""
echo "PRONTO: $OUT_ZIP"
echo "Tamanho: $(du -h "$OUT_ZIP" | cut -f1)"
echo ""
echo "Agora transfira claude-skills-export.zip para a outra maquina e rode import-all-skills.sh la."
