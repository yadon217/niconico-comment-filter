#!/usr/bin/env bash
# Auto commit & push after Agent completes a turn.
# Complements GitDoc (which only triggers on editor Save).
#
# Invocation (hooks.json, all platforms):
#   node .cursor/hooks/auto-git-sync.mjs
# Manual fallback on Windows: .cursor/hooks/auto-git-sync.cmd
set +e

LOG_FILE=".cursor/hooks/sync.log"
input=$(cat)

json_field() {
  echo "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -1
}

status=$(json_field status)
status=${status:-completed}
if [[ "$status" != "completed" ]]; then
  exit 0
fi

root=$(echo "$input" | sed -n 's/.*"workspace_roots"[[:space:]]*:[[:space:]]*\[[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
if [[ -z "$root" || ! -d "$root" ]]; then
  root="$(cd "$(dirname "$0")/../.." && pwd)"
fi
cd "$root" || exit 0

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

mkdir -p .cursor/hooks
log() { echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*" >> "$LOG_FILE"; }

# Extension source + Agent docs (not .vscode/settings.json — manual commit)
TARGETS=(
  AGENTS.md
  README.md
  .gitignore
  .editorconfig
  package.json
  package-lock.json
  vitest.config.js
  manifest.json
  src/
  icons/
  tests/
  .cursor/hooks/
  .vscode/bash.md
  .vscode/extensions.json
)

has_relevant=false
for target in "${TARGETS[@]}"; do
  if [[ -e "$target" ]] && git status --porcelain -- "$target" 2>/dev/null | grep -q .; then
    has_relevant=true
    break
  fi
done

if [[ "$has_relevant" != true ]]; then
  exit 0
fi

for target in "${TARGETS[@]}"; do
  [[ -e "$target" ]] && git add -A -- "$target" 2>/dev/null
done

# Exclude hook log from staging
git reset -- .cursor/hooks/sync.log 2>/dev/null

if git diff --cached --quiet; then
  exit 0
fi

file_count=$(git diff --cached --name-only | wc -l)
summary=$(git diff --cached --name-only | head -5 | tr '\n' ', ' | sed 's/, $//')
msg="Auto-sync: update ${file_count} file(s) (${summary})"

if git commit -m "$msg"; then
  log "committed: $msg"
  branch=$(git branch --show-current)
  if git push origin "$branch" 2>>"$LOG_FILE"; then
    log "pushed to origin/$branch"
  else
    log "push failed (see sync.log)"
  fi
else
  log "commit failed"
fi

exit 0
