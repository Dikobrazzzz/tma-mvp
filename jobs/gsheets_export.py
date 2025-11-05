# /opt/tma-mvp/jobs/gsheets_export.py
from typing import List
import os
import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build

# NEW:
import sqlalchemy as sa

SCOPE = ["https://www.googleapis.com/auth/spreadsheets"]

def _sheets_service(creds_path: str):
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=SCOPE)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)

# NEW: удобный конструктор SQLAlchemy-DSN из LW_PG_DSN
def _sa_dsn():
    d = os.getenv("LW_PG_DSN", "postgresql://tma:tma@127.0.0.1:5432/tma")
    return "postgresql+psycopg://" + d[len("postgresql://"):] if d.startswith("postgresql://") else d

def winners_df_for_day(day_str: str) -> pd.DataFrame:
    # GGR берём из lw_ledger как суммарный GGR за день по email
    sql = sa.text("""
        WITH daily_ggr AS (
            SELECT
                email_norm,
                (date_ts AT TIME ZONE 'UTC')::date AS d,   -- нормализуем к дате (UTC)
                SUM(ggr) AS ggr_sum
            FROM public.lw_ledger
            GROUP BY email_norm, (date_ts AT TIME ZONE 'UTC')::date
        )
        SELECT
            w.draw_id                             AS "Date",
            w.email_norm                          AS "Email",
            w.user_id                             AS "AccountID",
            COALESCE(dg.ggr_sum, 0)::float8       AS "GGR",
            w.amount_eur::float8                  AS "Reward",
            (w.claimed_at IS NOT NULL)::bool      AS "Claimed"
        FROM public.lw_winners w
        LEFT JOIN daily_ggr dg
          ON dg.email_norm = w.email_norm
         AND dg.d = w.draw_id::date
        WHERE w.draw_id = :d
        ORDER BY w.amount_eur DESC, w.email_norm
    """)
    eng = sa.create_engine(_sa_dsn())
    with eng.connect() as con:
        df = pd.read_sql(sql, con, params={"d": day_str})
    return df

# NEW: за «вчера» (UTC)
def winners_df_yesterday() -> pd.DataFrame:
    y = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    return winners_df_for_day(y)

def ensure_worksheet(service, spreadsheet_id: str, sheet_title: str):
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = meta.get("sheets", [])
    for s in sheets:
        if s["properties"]["title"] == sheet_title:
            return s["properties"]["sheetId"]
    requests = [{"addSheet": {"properties": {"title": sheet_title}}}]
    res = service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id, body={"requests": requests}
    ).execute()
    return res["replies"][0]["addSheet"]["properties"]["sheetId"]

def clear_sheet(service, spreadsheet_id: str, sheet_title: str):
    rng = f"{sheet_title}!A:ZZ"
    service.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id,
        range=rng,
        body={}
    ).execute()

def _cell_value(v):
    if pd.isna(v):
        return None
    if isinstance(v, (bool, np.bool_)):
        return "Yes" if bool(v) else "No"
    if isinstance(v, (int, float, np.integer, np.floating)):
        return float(v)
    return str(v)

def df_to_values(df: pd.DataFrame) -> List[List]:
    values = [list(df.columns)]
    for _, row in df.iterrows():
        values.append([_cell_value(v) for v in row.tolist()])
    return values

def upload_dataframe(spreadsheet_id: str, sheet_title: str, df: pd.DataFrame, creds_path: str):
    service = _sheets_service(creds_path)
    ensure_worksheet(service, spreadsheet_id, sheet_title)
    clear_sheet(service, spreadsheet_id, sheet_title)

    body = {"values": df_to_values(df)}
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_title}!A1",
        valueInputOption="RAW",
        body=body
    ).execute()
