# lw_job_final.py
import os
import argparse
import random
import requests
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
try:
    pd.set_option("future.no_silent_downcasting", True)
except Exception:
    pass

import psycopg
import sqlalchemy as sa

PRIZE = float(os.getenv("LW_PRIZE", "500"))
TAIL_Q = float(os.getenv("LW_TAIL_Q", "0.025"))
VIP_DEFAULT = int(os.getenv("LW_VIP_DEFAULT", "3"))
FORCE_VIP_LEVEL = os.getenv("LW_FORCE_VIP_LEVEL")  # None | "3" | "2" ...
WINNERS_COUNT = {
    "Group 1": int(os.getenv("LW_WIN_G1", "9")),
    "Group 2": int(os.getenv("LW_WIN_G2", "10")),
    "Group 3": int(os.getenv("LW_WIN_G3", "4")),
    "Group 4": int(os.getenv("LW_WIN_G4", "2")),
}
GROUP_WEIGHTS = {
    "Group 1": float(os.getenv("LW_GW_G1", "1.0")),
    "Group 2": float(os.getenv("LW_GW_G2", "1.0")),
    "Group 3": float(os.getenv("LW_GW_G3", "1.0")),
    "Group 4": float(os.getenv("LW_GW_G4", "1.0")),
    "Any": 1.0,
}
INCLUDE_ZERO_GGR = os.getenv("LW_INCLUDE_ZERO_GGR", "0") == "1"
TOTAL_WINNERS_PER_DAY = 25
TRIGGER_MODAL_FOR_PAST = os.getenv("LW_TRIGGER_MODAL_FOR_PAST", "0") == "1"
METRIC_WEIGHTS = {
    "sqrt": float(os.getenv("LW_M_SQRT", "0.5")),
    "ln": float(os.getenv("LW_M_LN", "0.3")),
    "Z": float(os.getenv("LW_M_Z", "0.2")),
}
MAX_CONSEC_WINS = int(os.getenv("LW_MAX_CONSEC", "4"))
MIN_CHANCE = float(os.getenv("LW_MIN_CHANCE", "0.0"))
MAX_CHANCE = float(os.getenv("LW_MAX_CHANCE", "0.1"))

GGR_MIN_ABS = float(os.getenv("LW_GGR_MIN_ABS", "1.0"))
REQUIRE_TURNOVER_POS = os.getenv("LW_REQUIRE_TURNOVER_POS", "0") == "1"

REQ_VIP_G4 = os.getenv("LW_REQUIRE_VIP_G4", "0") == "1"
VIP_G4_MIN = int(os.getenv("LW_VIP_G4_MIN", "2"))

TOPUP_INCLUDE_NEG = os.getenv("LW_TOPUP_INCLUDE_NEG", "0") == "1"

def dsn() -> str:
    return os.getenv("LW_PG_DSN", "postgresql://tma:tma@127.0.0.1:5432/tma")

def _sa_dsn() -> str:
    d = dsn()
    if d.startswith("postgresql://"):
        return "postgresql+psycopg://" + d[len("postgresql://") :]
    return d

ENGINE = sa.create_engine(_sa_dsn())

def utc_day_bounds(day: date):
    start = datetime.combine(day, datetime.min.time()).replace(tzinfo=timezone.utc)
    return start, start + timedelta(days=1)

def read_ledger(d_from: datetime, d_to: datetime) -> pd.DataFrame:
    sql = sa.text(
        """
        SELECT
          COALESCE(user_id, 0)       AS user_id,
          email_norm,
          date_ts::date              AS d,
          ggr,
          inout,
          turnover,
          deposit_amount,
          NULL::int                  AS vip_level
        FROM lw_ledger
        WHERE date_ts >= :from AND date_ts < :to
          AND email_norm IS NOT NULL
          AND date_ts::date <> DATE '1970-01-01'
        """
    )
    with ENGINE.connect() as con:
        df = pd.read_sql(sql, con, params={"from": d_from, "to": d_to})

    if df.empty:
        return df

    if FORCE_VIP_LEVEL is not None:
        try:
            forced = int(FORCE_VIP_LEVEL)
        except Exception:
            forced = VIP_DEFAULT
        df["vip_level"] = forced
    else:
        df["vip_level"] = df["vip_level"].fillna(VIP_DEFAULT)
        df["vip_level"] = df["vip_level"].replace({0: VIP_DEFAULT})

    df["vip_level"] = df["vip_level"].astype(int)

    df.rename(
        columns={
            "d": "Date",
            "user_id": "AccountID",
            "inout": "NetCashEUR",
            "deposit_amount": "DepositAmount",
            "ggr": "GGR",
        },
        inplace=True,
    )

    df = df[df["GGR"].abs() >= GGR_MIN_ABS]
    if REQUIRE_TURNOVER_POS:
        df = df[df["turnover"].fillna(0) > 0]

    return df[
        [
            "Date",
            "AccountID",
            "email_norm",
            "GGR",
            "NetCashEUR",
            "turnover",
            "DepositAmount",
            "vip_level",
        ]
    ]

def fetch_consecutive_wins_before(d_from: datetime) -> dict:
    sql = sa.text(
        """
        SELECT draw_id, email_norm
        FROM lw_winners
        WHERE draw_id < :d
          AND draw_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND computed_at >= now() - interval '60 days'
        ORDER BY draw_id DESC
        """
    )
    with ENGINE.connect() as con:
        df = pd.read_sql(sql, con, params={"d": d_from.date().isoformat()})
    if df.empty:
        return {}
    streaks = {}
    for email, g in df.groupby("email_norm"):
        dates = sorted(g["draw_id"].unique(), reverse=True)
        s, last = 0, None
        for d in dates:
            if last is None:
                s, last = 1, d
            else:
                prev = datetime.fromisoformat(last) - timedelta(days=1)
                if d == prev.date().isoformat():
                    s, last = s + 1, d
                else:
                    break
        streaks[email] = s
    return streaks

def weighted_choice(emails, k, prev_winners: set, consec: dict, group_name: str):
    if not emails:
        return []
    try:
        k_int = int(k)
    except Exception:
        k_int = 0
    k_int = max(0, min(k_int, len(emails)))
    if k_int == 0:
        return []
    w = []
    for e in emails:
        s = consec.get(e, 0)
        base = 1.0
        if s >= 1:
            base *= 1.0 / (1 + 0.7 * s)
        base += np.random.uniform(MIN_CHANCE, MAX_CHANCE)
        w.append(base)
    w = np.array(w, dtype=float)
    w_sum = w.sum()
    p = None if (not np.isfinite(w_sum) or w_sum <= 0) else (w / w_sum)
    idx = np.random.choice(len(emails), size=int(k_int), replace=False, p=p)
    return [emails[i] for i in idx]

def pick_group_winners(
    df_group: pd.DataFrame, need: int, prev_winners: set, consec: dict, group_name: str
) -> pd.DataFrame:
    emails = df_group["email_norm"].unique().tolist()
    chosen = weighted_choice(emails, need, prev_winners, consec, group_name)
    wins = df_group[df_group["email_norm"].isin(chosen)].copy()
    for e in chosen:
        consec[e] = min(MAX_CONSEC_WINS, consec.get(e, 0) + 1 if e in prev_winners else 1)
    return wins

def round_to_cents_sum(amounts, total=500.0):
    amounts = np.array(amounts, dtype=float)
    if len(amounts) == 0:
        return amounts
    cents = np.rint(amounts * 100.0, dtype=np.float64)
    floors = np.floor(cents)
    remainder = int(round(total * 100 - floors.sum()))
    if remainder > 0:
        frac = cents - floors
        order = np.argsort(-frac)
        floors[order[:remainder]] += 1
    elif remainder < 0:
        frac = cents - floors
        order = np.argsort(frac)
        floors[order[: (-remainder)]] -= 1
    floors = np.clip(floors, 0, None)
    return floors / 100.0

def compute_metrics_and_rewards(df_day: pd.DataFrame) -> pd.DataFrame:
    g = df_day["GGR"].astype(float).to_numpy()
    df_day["sqrt"] = np.sqrt(np.abs(g))
    df_day["ln"] = np.log1p(np.abs(g))
    mu = float(np.mean(g))
    sd = float(np.std(g) or 1e-6)
    df_day["Z"] = np.abs((g - mu) / sd)

    out = df_day.copy()
    for m in ["sqrt", "ln", "Z"]:
        s = float(out[m].sum())
        out[f"{m}_share"] = 0.0 if s <= 0 else out[m] / s * PRIZE

    out["base_reward"] = (
        out["sqrt_share"] * METRIC_WEIGHTS["sqrt"]
        + out["ln_share"] * METRIC_WEIGHTS["ln"]
        + out["Z_share"]  * METRIC_WEIGHTS["Z"]
    )
    out["adj_reward"] = out["base_reward"]

    for gname, w in GROUP_WEIGHTS.items():
        out.loc[out["group"] == gname, "adj_reward"] *= w

    total_adj = float(out["adj_reward"].sum())

    if total_adj > 0:
        raw = PRIZE * out["adj_reward"] / total_adj
    else:
        n = len(out)
        raw = np.full(n, PRIZE / n if n > 0 else 0.0, dtype=float)

    out["final_reward"] = round_to_cents_sum(raw, PRIZE)
    out["final_reward"] = np.clip(out["final_reward"], 0.0, None)
    return out

def _key(row):
    if isinstance(row, dict):
        e = (row.get("email_norm") or "")
        u = row.get("AccountID")
    else:
        e = getattr(row, "email_norm", "") or ""
        u = getattr(row, "AccountID", None)
    try:
        u = int(u) if (u is not None and str(u).isdigit()) else None
    except Exception:
        u = None
    return (e, u)

def top_up_after_quota(picked_rows, group1_rows, group2_rows, group3_rows, group4_rows, target_count, include_neg=False):
    already = {_key(r) for r in picked_rows}

    pool = []
    for r in (group1_rows or []):
        if _key(r) not in already:
            pool.append(r)
    for r in (group2_rows or []):
        if _key(r) not in already:
            pool.append(r)

    if include_neg:
        for r in (group3_rows or []):
            if _key(r) not in already:
                pool.append(r)
        for r in (group4_rows or []):
            if _key(r) not in already:
                pool.append(r)

    random.shuffle(pool)

    need = max(0, int(target_count) - len(picked_rows))
    take = min(need, len(pool))
    picked_more = pool[:take]
    new_picked = picked_rows + picked_more
    return new_picked, picked_more, len(pool)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", help="YYYY-MM-DD (UTC inclusive)")
    ap.add_argument("--to", dest="date_to", help="YYYY-MM-DD (UTC exclusive)")
    ap.add_argument("--draw-id", dest="draw_id", help="идентификатор розыгрыша")
    ap.add_argument("--dry", action="store_true", help="не писать в БД, только превью")
    args = ap.parse_args()

    today = datetime.now(timezone.utc).date()
    if args.date_from and args.date_to:
        d_from = datetime.fromisoformat(args.date_from).replace(tzinfo=timezone.utc)
        d_to = datetime.fromisoformat(args.date_to).replace(tzinfo=timezone.utc)
    else:
        d_from, d_to = utc_day_bounds(today - timedelta(days=1))

    draw_id = args.draw_id or d_from.date().isoformat()

    df = read_ledger(d_from, d_to)
    if df.empty:
        print(f"[info] нет строк в lw_ledger за {d_from}..{d_to}")
        return

    consec = fetch_consecutive_wins_before(d_from)
    prev_winners = set(consec.keys())

    all_day_winners = []
    for day in sorted(df["Date"].unique()):
        df_day = df[df["Date"] == day].copy()
        if not INCLUDE_ZERO_GGR:
            df_day = df_day[df_day["GGR"] != 0]
        if df_day.empty:
            print(f"[{day}] skipped: all users have GGR = 0")
            continue

        if df_day.empty:
            print(f"[{day}] skipped: all users have GGR = 0")
            continue

        q_low = float(np.quantile(df_day["GGR"], TAIL_Q))
        q_high = float(np.quantile(df_day["GGR"], 1 - TAIL_Q))
        df_day["lower"] = (df_day["GGR"] < q_low).astype(int)
        df_day["upper"] = (df_day["GGR"] > q_high).astype(int)
        daily_outliers = df_day[(df_day["lower"] == 0) & (df_day["upper"] == 0)].copy()
        if daily_outliers.empty:
            daily_outliers = df_day.copy()

        outliers_mean = float(daily_outliers["GGR"].mean())
        outliers_std = float(daily_outliers["GGR"].std(ddof=0) or 0.0)
        OUTLIER_STD_MULT = float(os.getenv("LW_OUTLIER_STD_MULT", "2.0"))
        outliers_border = outliers_mean + outliers_std * OUTLIER_STD_MULT

        df_day = df_day[df_day["GGR"] < outliers_border].copy()
        if df_day.empty:
            print(f"[{day}] skipped after border cut: GGR < {outliers_border:.2f} → 0 rows")
            continue

        df_day["mean"] = outliers_mean

        def classify_original(row):
            g = float(row["GGR"])
            lower = int(row.get("lower", 0))
            vip = int(row["vip_level"])
            if g > row["mean"]:
                return "Group 1"
            elif g >= 0:
                return "Group 2"
            elif (g < 0) and (lower != 1):
                return "Group 3"
            elif (g < 0) and (lower == 1) and (vip != 1):
                return "Group 4"
            else:
                return "Other"

        df_day["group"] = df_day.apply(classify_original, axis=1)

        g1_cand = df_day[df_day["group"] == "Group 1"].drop_duplicates("email_norm").to_dict("records")
        g2_cand = df_day[df_day["group"] == "Group 2"].drop_duplicates("email_norm").to_dict("records")
        g3_cand = df_day[df_day["group"] == "Group 3"].drop_duplicates("email_norm").to_dict("records")
        g4_cand = df_day[df_day["group"] == "Group 4"].drop_duplicates("email_norm").to_dict("records")

        day_wins_parts = []
        picked_emails = set()
        for (d_cur, gname), grp in df_day.groupby(["Date", "group"]):
            if gname not in WINNERS_COUNT:
                continue
            need = WINNERS_COUNT.get(gname, 0)
            cand = grp["email_norm"].nunique()
            if need <= 0 or grp.empty:
                print(f"[{day}] {gname}: candidates={cand}, picked=0 (skip)")
                continue
            sel = pick_group_winners(grp, need, prev_winners, consec, gname)
            picked = sel["email_norm"].nunique()
            picked_emails |= set(sel["email_norm"].unique())
            print(f"[{day}] {gname}: candidates={cand}, picked={picked} (quota={need})")
            if not sel.empty:
                day_wins_parts.append(sel)

        picked_rows = []
        if day_wins_parts:
            picked_rows = (
                pd.concat(day_wins_parts, ignore_index=True)
                .drop_duplicates(subset=["email_norm"])
                .to_dict("records")
            )

        already = len(picked_rows)
        need_more = max(0, TOTAL_WINNERS_PER_DAY - already)
        if need_more > 0:
            new_picked, picked_more, pool_size = top_up_after_quota(
                picked_rows,
                g1_cand,
                g2_cand,
                g3_cand,
                g4_cand,
                TOTAL_WINNERS_PER_DAY,
                include_neg=TOPUP_INCLUDE_NEG,
            )
            prev_keys = {_key(r) for r in picked_rows}
            added_rows = [r for r in new_picked if _key(r) not in prev_keys]
            if added_rows:
                extra_df = pd.DataFrame(added_rows)
                day_wins_parts.append(extra_df)
                picked_emails |= set(extra_df["email_norm"].unique())
            print(f"[{day}] top-up: need_more={need_more}, pool={pool_size}, added={len(added_rows)}")
        else:
            print(f"[{day}] top-up: not needed (already={already})")

        if not day_wins_parts:
            continue

        day_wins = pd.concat(day_wins_parts, ignore_index=True)

        day_out = compute_metrics_and_rewards(day_wins)
        all_day_winners.append(day_out)
        prev_winners.update(day_out["email_norm"].unique().tolist())

        print(f"[{day}] winners={day_out['email_norm'].nunique()} sum={day_out['final_reward'].sum():.2f}")

    if not all_day_winners:
        print("[info] победителей не выбрано")
        return

    result = pd.concat(all_day_winners, ignore_index=True)

    with psycopg.connect(dsn()) as con, con.cursor() as cur:
        for _, r in result.iterrows():
            cur.execute(
                """
                INSERT INTO lw_winners (draw_id, user_id, email_norm, amount_eur, rank, reason)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (draw_id, email_norm) DO UPDATE
                  SET amount_eur = EXCLUDED.amount_eur,
                      rank = EXCLUDED.rank,
                      reason = EXCLUDED.reason,
                      computed_at = now();
                """,
                (
                    draw_id,
                    int(r["AccountID"]) if pd.notna(r["AccountID"]) else None,
                    r["email_norm"],
                    float(r["final_reward"]),
                    0,
                    f"{r['group']} | GGR={round(float(r['GGR']), 2)}",
                ),
            )
        con.commit()
    print(f"[ok] winners upserted for draw_id={draw_id}")

    cio_webhook_url = os.getenv("CUSTOMERIO_WEBHOOK_URL")
    if cio_webhook_url:
        computed_at = datetime.now(timezone.utc).isoformat()
        sent_count = 0
        for _, r in result.iterrows():
            payload = {
                "email": r["email_norm"],
                "user_id": int(r["AccountID"]) if pd.notna(r["AccountID"]) else 0,
                "reward_amount": float(r["final_reward"]),
                "draw_id": draw_id,
                "claimed_at": computed_at,
                "event_name": "lucky_winner_reward"
            }
            try:
                resp = requests.post(cio_webhook_url, json=payload, timeout=5)
                if resp.status_code < 300:
                    sent_count += 1
                else:
                    print(f"[warn] customer.io webhook failed for {r['email_norm']}: {resp.status_code}")
            except Exception as e:
                print(f"[error] customer.io webhook error for {r['email_norm']}: {e}")
        print(f"[ok] customer.io webhooks sent: {sent_count}/{len(result)}")
    else:
        print("[info] CUSTOMERIO_WEBHOOK_URL not set, skipping webhooks")

    unique_emails = result["email_norm"].dropna().unique().tolist()
    with psycopg.connect(dsn()) as con, con.cursor() as cur:
        for email in unique_emails:
            cur.execute(
                """
                INSERT INTO claim_denied_oneoff (email_norm, shown_at)
                VALUES (%s, NULL)
                ON CONFLICT (email_norm) DO UPDATE
                  SET shown_at = NULL;
                """,
                (email,),
            )
        con.commit()
    print(f"[ok] triggered Claim Bonus modal for {len(unique_emails)} unique winners (claim_denied_oneoff updated)")

    to_keep = result["email_norm"].dropna().unique().tolist()
    with psycopg.connect(dsn()) as con, con.cursor() as cur:
        cur.execute(
            """
            DELETE FROM lw_winners
            WHERE draw_id = %s
              AND NOT (email_norm = ANY(%s));
            """,
            (draw_id, to_keep),
        )
        deleted = cur.rowcount
        con.commit()
    print(f"[ok] pruned {deleted} stale rows for draw_id={draw_id}")

    print("[preview] первые 20 строк:")
    print(result[["Date", "email_norm", "AccountID", "group", "GGR", "final_reward"]].head(20))
    by_day = result.groupby("Date")["final_reward"].sum().reset_index()
    print("[check] сумма по дням (должно быть ровно PRIZE на день):")
    print(by_day)

    if args.dry:
        print("[dry-run] запись отключена")

if __name__ == "__main__":
    main()
