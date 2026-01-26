#!/usr/bin/env bash
set -euo pipefail

[ -f /opt/tma-mvp/jobs/.env.import ] && . /opt/tma-mvp/jobs/.env.import

Y=$(date -u -d "yesterday" +%Y-%m-%d)
N=$(date -u -d "$Y +1 day" +%Y-%m-%d)

export LW_FROM="$Y"
export LW_TO="$N"

exec /opt/tma-mvp/.venv/bin/python /opt/tma-mvp/jobs/gsheets_to_lw_ledger.py




