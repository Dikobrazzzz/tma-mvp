#!/usr/bin/env bash
set -euo pipefail

# .env с параметрами механики/экспорта и (если нужно) LW_PG_DSN
[ -f /opt/tma-mvp/jobs/.env ] && . /opt/tma-mvp/jobs/.env

Y=$(date -u -d "yesterday" +%Y-%m-%d)
N=$(date -u -d "$Y +1 day" +%Y-%m-%d)

exec /opt/tma-mvp/.venv/bin/python /opt/tma-mvp/jobs/lw_job.py \
  --from "$Y" --to "$N" --draw-id "$Y"
