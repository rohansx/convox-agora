#!/usr/bin/env bash
# Ship the working tree to the VPS and (re)start Convox on Agora at https://app.convox.ai.
# The server keeps its own /opt/convox-agora/.env (PUBLIC_URL=https://app.convox.ai); this never
# copies one unless --env is given (first deploy, or after changing keys).
set -euo pipefail
HOST=${CONVOX_HOST:-root@187.127.185.75}
DIR=/opt/convox-agora
cd "$(dirname "$0")/.."

rsync -az --delete \
  --exclude .git --exclude .venv --exclude '__pycache__' --exclude data --exclude .env \
  ./ "$HOST:$DIR/"
if [[ "${1:-}" == "--env" ]]; then
  sed 's|^PUBLIC_URL=.*|PUBLIC_URL=https://app.convox.ai|' .env | ssh "$HOST" "cat > $DIR/.env && chmod 600 $DIR/.env"
fi
ssh "$HOST" "cd $DIR && docker compose -f deploy/compose.yml --env-file .env up -d --build"
