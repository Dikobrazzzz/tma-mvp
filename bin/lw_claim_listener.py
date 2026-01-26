#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import sys
import json
import time
import signal
import select
from datetime import datetime

import psycopg

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

def _fatal_env(msg: str):
    print(f"[fatal] {msg}", flush=True)
    sys.exit(1)

if not LW_GSHEET_ID or not os.path.isfile(LW_GSHEET_CREDS):
    _fatal_env("LW_GSHEET_ID or LW_GSHEET_CREDS not set/exists")

def on_notify(payload: str):
    try:
        evt = json.loads(payload)
    except Exception as e:
        log(f"[warn] bad JSON payload: {e}; raw={payload!r}")
        return

    if evt.get("op") != "CLAIMED":
        return

    date_str   = (evt.get("draw_id") or "").strip()
    email_norm = (evt.get("email_norm") or "").strip().lower()
    if not date_str or not email_norm:
        log(f"[warn] missing fields in payload: {payload!r}")
        return

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

def listen_loop():
    with psycopg.connect(LW_PG_DSN) as conn:
        with conn.cursor() as cur:
            cur.execute("LISTEN lw_claimed;")
        conn.commit()

        log("listening on channel 'lw_claimed'")
        fd = conn.fileno()

        while _running:
            r, _, _ = select.select([fd], [], [], 1.0)
            if not r:
                continue

            for n in conn.notifies():
                on_notify(n.payload)

def main():
    backoff = 1.0
    while _running:
        try:
            listen_loop()
        except Exception as e:
            log(f"[error] listen_loop crashed: {e!r}; retry in {backoff:.1f}s")
            time.sleep(backoff)
            backoff = min(backoff * 2.0, 30.0)
        else:
            break

if __name__ == "__main__":
    main()
