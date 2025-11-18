#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Sheets → lw_ledger (по умолчанию: вчерашний день UTC)
Ожидаемые колонки листа (вкладка report):
User ID | Email | Phone | Date | Country | Ggr | Inout | Turnover | Deposit Amount
"""

import os, re
from datetime import datetime, timezone, timedelta
import pandas as pd
import psycopg
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

# --- отдельный env для импорта ---
load_dotenv(os.getenv("ENVFILE", "/opt/tma-mvp/jobs/.env.import"))

# --- ENV ---
LW_FALLBACK_METRIC = os.getenv("LW_FALLBACK_METRIC", "").strip().lower()
GSHEET_ID    = os.getenv("LW_GSHEET_ID")
GSHEET_TAB   = os.getenv("LW_GSHEET_TAB", "report")
GSHEET_CREDS = os.getenv("LW_GSHEET_CREDS", "/opt/tma-mvp/creds/sa_gsheets.json")
PG_DSN       = os.getenv("LW_PG_DSN", "postgresql://tma:tma@127.0.0.1:5432/tma")
SRC_DEFAULT  = os.getenv("LW_SRC_FILE_DEFAULT", f"gsheet:{GSHEET_TAB}")
LW_FROM      = os.getenv("LW_FROM")  # YYYY-MM-DD (опц.)
LW_TO        = os.getenv("LW_TO")    # YYYY-MM-DD (опц.)

# Список исключаемых стран можно переопределить через ENV:
# EXCLUDE_COUNTRIES="Kenya,Кения,Nigeria,Нигерия"
_EXCL_ENV = os.getenv("EXCLUDE_COUNTRIES", "Kenya,Кения")
EXCLUDE_COUNTRIES = {c.strip().casefold() for c in _EXCL_ENV.split(",") if c.strip()}

REQUIRED_COLS = ["User ID","Email","Date","Country","Ggr","Inout","Turnover","Deposit Amount"]

def _err(msg): raise SystemExit(f"[error] {msg}")

def _norm_email(x):
    if x is None: return None
    x = str(x).strip().lower()
    x = re.sub(r"\s+", "", x)
    return x or None

def _parse_num(x):
    """
    Robust parser for localized numbers:
    - нормализует юникод-минус (U+2212) в '-'
    - убирает любые пробелы, NBSP (U+00A0) и узкий NBSP (U+202F)
    - вычищает всё, кроме цифр, минуса, точки и запятой
    - корректно обрабатывает '1.234,56', '1,234.56', '-4,54' и т.п.
    """
    if x is None:
        return None
    s = str(x).strip()
    if s == "":
        return None

    s = s.replace("\u2212", "-")                    # U+2212 → '-'
    s = re.sub(r"[\s\u00A0\u202F]", "", s)          # удалить все пробелы/NBSP
    s = re.sub(r"[^0-9\-\.,]", "", s)               # оставить цифры, -, . ,

    if s.count(",") == 1 and s.count(".") == 0:
        # 12,34 -> 12.34
        s = s.replace(",", ".")
    elif s.count(".") == 1 and s.count(",") >= 1:
        # 1,234.56 -> 1234.56
        s = s.replace(",", "")
    elif s.count(",") > 1 and s.count(".") == 0:
        # 1,234,56 -> 1234.56
        parts = s.split(","); s = "".join(parts[:-1]) + "." + parts[-1]
    elif s.count(".") > 1 and s.count(",") == 0:
        # 1.234.56 -> 1234.56
        parts = s.split("."); s = "".join(parts[:-1]) + "." + parts[-1]

    try:
        return float(s)
    except:
        return None

def _parse_dt_utc(x):
    if x is None or str(x).strip()=="":
        return None
    s = str(x).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y"):
        try:
            dt = datetime.strptime(s, fmt)
            if fmt in ("%Y-%m-%d", "%d.%m.%Y"):
                dt = dt.replace(hour=0, minute=0, second=0)
            return dt.replace(tzinfo=timezone.utc)
        except:
            pass
    try:
        dt = pd.to_datetime(s, utc=True)
        if dt.tzinfo is None: dt = dt.tz_localize("UTC")
        return dt.to_pydatetime()
    except:
        return None

def read_sheet() -> pd.DataFrame:
    if not GSHEET_ID or not os.path.isfile(GSHEET_CREDS):
        _err("Нужны LW_GSHEET_ID и валидный JSON-ключ LW_GSHEET_CREDS")

    creds = service_account.Credentials.from_service_account_file(
        GSHEET_CREDS,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
    resp = svc.spreadsheets().values().get(
        spreadsheetId=GSHEET_ID,
        range=f"{GSHEET_TAB}!A:Z",
        valueRenderOption="UNFORMATTED_VALUE"
    ).execute()
    values = resp.get("values", [])
    if not values:
        print("[read] sheet empty")
        return pd.DataFrame()

    header, rows = values[0], values[1:]
    df = pd.DataFrame(rows, columns=header).copy()
    df.columns = [c.strip() for c in df.columns]

    miss = [c for c in REQUIRED_COLS if c not in df.columns]
    if miss:
        _err(f"В листе нет обязательных колонок: {miss}. Есть: {list(df.columns)}")

    # Маппинг и нормализация
    df["user_id"]        = df["User ID"].map(lambda x: int(float(x)) if str(x).strip()!="" else 0)
    df["email_norm"]     = df["Email"].map(_norm_email)
    df["date_ts"]        = df["Date"].map(_parse_dt_utc)
    df["country"]        = df["Country"].map(lambda s: str(s).strip() if str(s).strip()!="" else None)
    df["ggr"]            = df["Ggr"].map(_parse_num)
    df["inout"]          = df["Inout"].map(_parse_num)
    df["turnover"]       = df["Turnover"].map(_parse_num)
    df["deposit_amount"] = df["Deposit Amount"].map(_parse_num)
    df["src_file"]       = SRC_DEFAULT

    # Обязательные поля
    df = df[(df["user_id"].notna()) & (df["user_id"]!=0) &
            (df["email_norm"].notna()) & (df["date_ts"].notna())]
    print(f"[map] rows_after_required={len(df)}")

    # --- 1) Диапазон дат (сначала!) ---
    if LW_FROM or LW_TO:
        if LW_FROM:
            start = datetime.fromisoformat(LW_FROM).replace(tzinfo=timezone.utc)
            df = df[df["date_ts"] >= start]
        if LW_TO:
            end = datetime.fromisoformat(LW_TO).replace(tzinfo=timezone.utc)
            df = df[df["date_ts"] < end]
    else:
        today_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        start, end = today_utc - timedelta(days=1), today_utc
        df = df[(df["date_ts"] >= start) & (df["date_ts"] < end)]
    print(f"[range] rows_after_date={len(df)} "
          f"(from={LW_FROM or start.date()} to<{LW_TO or end.date()})")

    # --- 2) Фильтр стран (если задан EXCLUDE_COUNTRIES) ---
    before_rows = len(df)
    if EXCLUDE_COUNTRIES:
        mask_keep = ~df["country"].fillna("").map(lambda s: s.casefold()).isin(EXCLUDE_COUNTRIES)
        df = df.loc[mask_keep].copy()
        dropped = before_rows - len(df)
        if dropped > 0:
            print(f"[country] dropped_by_country={dropped} (excluded={sorted(EXCLUDE_COUNTRIES)})")
    print(f"[country] rows_after_country={len(df)}")

    # --- 3) Fallback ggr<-inout (только внутри выбранного диапазона) ---
    if LW_FALLBACK_METRIC == "inout":
        mask = (df["ggr"].isna()) | (df["ggr"] == 0)
        replaced = int((mask & df["inout"].notna()).sum())
        df.loc[mask & df["inout"].notna(), "ggr"] = df.loc[mask, "inout"]
        print(f"[fallback] ggr<-inout replaced_in_range={replaced}")

    print(f"[read] rows={len(df)}")
    return df[["user_id","email_norm","date_ts","country","ggr","inout","turnover","deposit_amount","src_file"]].copy()

def _has_unique_uid_date(conn) -> bool:
    q = """
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.lw_ledger'::regclass
      AND contype='u'
      AND conname = 'uq_lw_ledger_uid_date'
    LIMIT 1;
    """
    with conn.cursor() as cur:
        cur.execute(q)
        return cur.fetchone() is not None

def ensure_unique(conn):
    try:
        conn.execute("ALTER TABLE public.lw_ledger ADD CONSTRAINT uq_lw_ledger_uid_date UNIQUE (user_id, date_ts);")
        conn.commit()
        print("[schema] created UNIQUE (user_id, date_ts)")
    except Exception:
        conn.rollback()  # уже есть/нет прав — ок

def upsert_on_conflict(conn, df: pd.DataFrame):
    sql = """
    INSERT INTO public.lw_ledger
        (user_id,email_norm,date_ts,country,ggr,inout,turnover,deposit_amount,src_file)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT ON CONSTRAINT uq_lw_ledger_uid_date DO UPDATE
      SET email_norm     = EXCLUDED.email_norm,
          country        = EXCLUDED.country,
          ggr            = EXCLUDED.ggr,
          inout          = EXCLUDED.inout,
          turnover       = EXCLUDED.turnover,
          deposit_amount = EXCLUDED.deposit_amount,
          src_file       = EXCLUDED.src_file,
          loaded_at      = now();
    """
    rows = [tuple(r) for r in df.itertuples(index=False, name=None)]
    with conn.cursor() as cur:
        cur.executemany(sql, rows)

def upsert_fallback(conn, df: pd.DataFrame):
    """
    Без UNIQUE: делаем DELETE по ключам, затем массовый INSERT.
    Это немного медленнее, но просто и надёжно.
    """
    rows = [tuple(r) for r in df.itertuples(index=False, name=None)]
    with conn.cursor() as cur:
        BATCH = 1000
        for i in range(0, len(rows), BATCH):
            keys = [(r[0], r[2]) for r in rows[i:i+BATCH]]  # (user_id, date_ts)
            ph = ",".join(["(%s,%s)"] * len(keys))
            params = [v for pair in keys for v in pair]
            cur.execute(f"""
                DELETE FROM public.lw_ledger
                 WHERE (user_id, date_ts) IN ({ph});
            """, params)
        cur.executemany("""
            INSERT INTO public.lw_ledger
                (user_id,email_norm,date_ts,country,ggr,inout,turnover,deposit_amount,src_file)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s);
        """, rows)

def main():
    df = read_sheet()
    print(f"[read] rows={len(df)}")
    if df.empty: return

    with psycopg.connect(PG_DSN) as conn:
        ensure_unique(conn)
        if _has_unique_uid_date(conn):
            upsert_on_conflict(conn, df)
            print("[upsert] ON CONFLICT uq_lw_ledger_uid_date")
        else:
            upsert_fallback(conn, df)
            print("[upsert] fallback delete+insert")
        conn.commit()
        print("[ok] written to lw_ledger")

if __name__ == "__main__":
    main()
