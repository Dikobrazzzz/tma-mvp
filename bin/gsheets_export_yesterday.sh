#!/usr/bin/env bash
set -euo pipefail
# env с ID/табом/кредами
[ -f /opt/tma-mvp/jobs/.env ] && . /opt/tma-mvp/jobs/.env

exec /opt/tma-mvp/.venv/bin/python - <<'PY'
import os, sys
# чтобы импортировался /opt/tma-mvp/jobs/gsheets_export.py
sys.path.insert(0, "/opt/tma-mvp/jobs")

from gsheets_export import winners_df_yesterday, upload_dataframe

SPREADSHEET_ID = os.environ['LW_GSHEET_ID']
SHEET = os.getenv('LW_GSHEET_TAB', 'winners')
CREDS = os.getenv('LW_GSHEET_CREDS', '/opt/tma-mvp/creds/sa_gsheets.json')

df = winners_df_yesterday()
upload_dataframe(SPREADSHEET_ID, SHEET, df, CREDS)
print(f"[gsheets] uploaded {len(df)} rows to '{SHEET}'")
PY
