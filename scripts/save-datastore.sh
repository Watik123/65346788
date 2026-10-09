#!/usr/bin/env bash
# Комітить зміни в datastore/ і надсилає їх у гілку запуску (для збору цін на GitHub).
# Запуск: scripts/save-datastore.sh "Повідомлення коміту"
set -euo pipefail
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add datastore
if git diff --cached --quiet; then echo "Нових даних немає"; exit 0; fi
git commit -q -m "$1"
for i in 1 2 3; do
  git pull -q --rebase origin "$GITHUB_REF_NAME" && git push -q origin "HEAD:$GITHUB_REF_NAME" && exit 0
  sleep 10
done
exit 1
