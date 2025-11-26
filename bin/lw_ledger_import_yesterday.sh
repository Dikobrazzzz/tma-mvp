#!/usr/bin/env bash
set -euo pipefail

# .env.import с параметрами импорта
[ -f /opt/tma-mvp/jobs/.env.import ] && . /opt/tma-mvp/jobs/.env.import

# Границы суток UTC (вчерашний день)
Y=$(date -u -d "yesterday" +%Y-%m-%d)
N=$(date -u -d "$Y +1 day" +%Y-%m-%d)

export LW_FROM="$Y"
export LW_TO="$N"

# Если нужно — временно отключить фильтр стран:
# export EXCLUDE_COUNTRIES=""

# Если в отчёте местами пустой GGR — подставлять Inout:
# export LW_FALLBACK_METRIC=inout

exec /opt/tma-mvp/.venv/bin/python /opt/tma-mvp/jobs/gsheets_to_lw_ledger.py

