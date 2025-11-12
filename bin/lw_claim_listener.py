#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Lucky Winner — realtime Sheets updater for claimed_at events.

Слушает канал Postgres LISTEN/NOTIFY 'lw_claimed' и при получении JSON-пэйлоада:
{
  "op": "CLAIMED",
  "draw_id": "YYYY-MM-DD",
  "email_norm": "user@example.com",
  "claimed_at": "2025-11-12T05:45:15+00:00"
}
обновляет колонку "Claimed" в Google Sheet (лист "winners") на "Yes" для строки с
совпадающими Date и Email.

Зависимости: psycopg (v3), google-api-python-client, google-auth.
"""

import os
import sys
import json
import time
import signal
import select
from datetime import datetime

import psycopg

# ── путь к jobs, чтобы импортировать gsheets_export.py ─────────────────────────
JOBS_DIR = "/opt/tma-mvp/jobs"
if JOBS_DIR not in sys.path:
    sys.path.insert(0, JOBS_DIR)

from gsheets_export import set_claimed_in_sheet  # noqa: E402

# ── ENV ────────────────────────────────────────────────────────────────────────
LW_PG_DSN       = os.environ.get("LW_PG_DSN", "postgresql://tma:tma@127.0.0.1:5432/tma")
LW_GSHEET_ID    = os.environ.get("LW_GSHEET_ID", "").strip()
LW_GSHEET_TAB   = os.environ.get("LW_GSHEET_TAB", "winners").strip()
LW_GSHEET_CREDS = os.environ.get("LW_GSHEET_CREDS", "/opt/tma-mvp/creds/sa_gsheets.json").strip()

LOG_PREFIX = "[claim-listener]"

def log(msg: str):
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{LOG_PREFIX} {ts} {msg}", flush=True)

# ── graceful shutdown ─────────────────────────────────────────────────────────
_running = True
def _sig_handler(signum, frame):
    global _running
    _running = False
    log(f"signal {signum} received, shutting down...")
signal.signal(signal.SIGTERM, _sig_handler)
signal.signal(signal.SIGINT, _sig_handler)

# ── валидация обязательных переменных ─────────────────────────────────────────
def _fatal_env(msg: str):
    print(f"[fatal] {msg}", flush=True)
    sys.exit(1)

if not LW_GSHEET_ID or not os.path.isfile(LW_GSHEET_CREDS):
    _fatal_env("LW_GSHEET_ID or LW_GSHEET_CREDS not set/exists")

# ── обработчик нотификаций ────────────────────────────────────────────────────
def on_notify(payload: str):
    """
    Обрабатывает входящий JSON из NOTIFY.
    """
    try:
        evt = json.loads(payload)
    except Exception as e:
        log(f"[warn] bad JSON payload: {e}; raw={payload!r}")
        return

    if evt.get("op") != "CLAIMED":
        # игнорим прочие типы
        return

    date_str   = (evt.get("draw_id") or "").strip()
    email_norm = (evt.get("email_norm") or "").strip().lower()
    if not date_str or not email_norm:
        log(f"[warn] missing fields in payload: {payload!r}")
        return

    # в листе ожидаются заголовки: Date, Email, Claimed
    try:
        ok = set_claimed_in_sheet(
            spreadsheet_id=LW_GSHEET_ID,
            sheet_title=LW_GSHEET_TAB,
            date_str=date_str,
            email_norm=email_norm,
            claimed=True,
            creds_path=LW_GSHEET_CREDS,
        )
        log(f"[sheets] claimed set: {ok} ({email_norm} @ {date_str})")
    except Exception as e:
        log(f"[error] set_claimed_in_sheet failed: {e}")

# ── цикл прослушивания LISTEN/NOTIFY (psycopg3 + select) ─────────────────────
def listen_loop():
    """
    Блокирующий цикл: LISTEN lw_claimed; затем ждём события через select().
    """
    with psycopg.connect(LW_PG_DSN) as conn:
        # LISTEN должен быть зафиксирован (транзакция завершена), чтобы начать получать события
        with conn.cursor() as cur:
            cur.execute("LISTEN lw_claimed;")
        conn.commit()

        log("listening on channel 'lw_claimed'")
        fd = conn.fileno()

        while _running:
            # ждём доступность сокета; timeout для возможности корректного выхода
            r, _, _ = select.select([fd], [], [], 1.0)
            if not r:
                continue

            # считываем все накопленные нотификации
            for n in conn.notifies():
                # n.payload — строка
                on_notify(n.payload)

# ── стратегия переподключений ────────────────────────────────────────────────
def main():
    backoff = 1.0
    while _running:
        try:
            listen_loop()
        except Exception as e:
            log(f"[error] listen_loop crashed: {e!r}; retry in {backoff:.1f}s")
            time.sleep(backoff)
            backoff = min(backoff * 2.0, 30.0)  # экспоненциально до 30с
        else:
            # нормальное завершение (например, SIGTERM)
            break

if __name__ == "__main__":
    main()
