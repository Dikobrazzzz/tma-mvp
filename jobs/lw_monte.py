#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import traceback
import argparse
from datetime import datetime, timezone
from typing import Dict, Tuple

import numpy as np
import pandas as pd
import sqlalchemy as sa
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed

pd.set_option('future.no_silent_downcasting', True)

from lw_job import (
    dsn, read_ledger, compute_daily_mu_sigma, classify_group,
    compute_metrics_and_rewards, WINNERS_COUNT
)

TOTAL_WINNERS_PER_DAY = sum(WINNERS_COUNT.values())

def _sa_dsn():
    d = dsn()
    return "postgresql+psycopg://" + d[len("postgresql://"):] if d.startswith("postgresql://") else d

def _make_engine():
    return sa.create_engine(_sa_dsn())

def list_available_days(limit=100000) -> pd.DataFrame:
    sql = sa.text("""
        SELECT date_ts::date AS d, COUNT(*) AS rows, COUNT(DISTINCT email_norm) AS participants
        FROM lw_ledger
        WHERE email_norm IS NOT NULL
          AND date_ts::date <> DATE '1970-01-01'
        GROUP BY 1
        HAVING COUNT(DISTINCT email_norm) > 0
        ORDER BY d
        LIMIT :lim
    """)
    with _make_engine().connect() as con:
        df = pd.read_sql(sql, con, params={"lim": limit})
    return df

def prep_day_frame(day_str: str) -> pd.DataFrame:
    d_from = datetime.fromisoformat(day_str).replace(tzinfo=timezone.utc)
    d_to   = d_from + pd.Timedelta(days=1)
    df = read_ledger(d_from, d_to)
    if df.empty:
        return pd.DataFrame()
    daily = df[df["Date"] == pd.to_datetime(day_str).date()].copy()
    if daily.empty:
        return pd.DataFrame()
    mid, mu, sigma = compute_daily_mu_sigma(daily)
    if mid.empty:
        return pd.DataFrame()
    mid["group"] = mid.apply(lambda r: classify_group(r, mu, sigma), axis=1)
    mid = mid[mid["group"] != "Other"].copy()
    return mid

def sample_once_with_topup(mid: pd.DataFrame, rng: np.random.Generator) -> Tuple[pd.DataFrame, Dict[str, int]]:
    if mid.empty:
        return pd.DataFrame(), {g: 0 for g in WINNERS_COUNT.keys()}

    parts = []
    picked_emails = set()
    per_group_counts = {g: 0 for g in WINNERS_COUNT.keys()}

    for gname, grp in mid.groupby("group"):
        if gname not in WINNERS_COUNT:
            continue
        need = int(WINNERS_COUNT.get(gname, 0))
        if need <= 0 or grp.empty:
            continue
        emails = grp["email_norm"].dropna().unique()
        k = min(need, len(emails))
        if k <= 0:
            continue
        idx = rng.choice(len(emails), size=k, replace=False)
        chosen = set(emails[idx])
        picked = grp[grp["email_norm"].isin(chosen)].copy()
        parts.append(picked)
        picked_emails |= chosen
        per_group_counts[gname] += picked["email_norm"].nunique()

    already = len(picked_emails)
    need_more = max(0, TOTAL_WINNERS_PER_DAY - already)
    if need_more > 0:
        pool = mid[mid["group"].isin(WINNERS_COUNT.keys())].copy()
        pool = pool.drop_duplicates(subset=["email_norm"])
        pool = pool[~pool["email_norm"].isin(picked_emails)]
        if not pool.empty:
            emails = pool["email_norm"].to_numpy()
            k = min(need_more, len(emails))
            if k > 0:
                idx = rng.choice(len(emails), size=k, replace=False)
                extra_emails = set(emails[idx])
                extra = pool[pool["email_norm"].isin(extra_emails)].copy()
                parts.append(extra)
                for gname, grp in extra.groupby("group"):
                    if gname in per_group_counts:
                        per_group_counts[gname] += grp["email_norm"].nunique()

    if not parts:
        return pd.DataFrame(), per_group_counts

    winners = pd.concat(parts, ignore_index=True)
    out = compute_metrics_and_rewards(winners)
    return out, per_group_counts

def _agg_init(groups) -> Dict:
    return {
        "runs": 0,
        "sum_rewards_min": float("+inf"),
        "sum_rewards_max": float("-inf"),
        "sum_rewards_sum": 0.0,

        "winners_min": float("+inf"),
        "winners_max": float("-inf"),
        "winners_sum": 0.0,

        "neg_rewards": 0,
        "per_group": {g: {"min": float("+inf"), "max": float("-inf"), "sum": 0.0} for g in groups},
    }

def _agg_update(acc: Dict, sr: float, wn: int, neg: bool, gsel: Dict[str, int]):
    acc["runs"] += 1
    if sr < acc["sum_rewards_min"]: acc["sum_rewards_min"] = sr
    if sr > acc["sum_rewards_max"]: acc["sum_rewards_max"] = sr
    acc["sum_rewards_sum"] += sr
    if wn < acc["winners_min"]: acc["winners_min"] = wn
    if wn > acc["winners_max"]: acc["winners_max"] = wn
    acc["winners_sum"] += wn
    if neg:
        acc["neg_rewards"] += 1
    for g, v in gsel.items():
        if g not in acc["per_group"]:
            continue
        if v < acc["per_group"][g]["min"]: acc["per_group"][g]["min"] = v
        if v > acc["per_group"][g]["max"]: acc["per_group"][g]["max"] = v
        acc["per_group"][g]["sum"] += v

def _agg_merge(a: Dict, b: Dict) -> Dict:
    out = _agg_init(WINNERS_COUNT.keys())
    out["runs"] = a["runs"] + b["runs"]
    out["sum_rewards_min"] = min(a["sum_rewards_min"], b["sum_rewards_min"])
    out["sum_rewards_max"] = max(a["sum_rewards_max"], b["sum_rewards_max"])
    out["sum_rewards_sum"] = a["sum_rewards_sum"] + b["sum_rewards_sum"]

    out["winners_min"] = min(a["winners_min"], b["winners_min"])
    out["winners_max"] = max(a["winners_max"], b["winners_max"])
    out["winners_sum"] = a["winners_sum"] + b["winners_sum"]

    out["neg_rewards"] = a["neg_rewards"] + b["neg_rewards"]

    for g in WINNERS_COUNT.keys():
        out["per_group"][g]["min"] = min(a["per_group"][g]["min"], b["per_group"][g]["min"])
        out["per_group"][g]["max"] = max(a["per_group"][g]["max"], b["per_group"][g]["max"])
        out["per_group"][g]["sum"] = a["per_group"][g]["sum"] + b["per_group"][g]["sum"]
    return out

def _worker(worker_id: int, runs: int, seed: int, fixed_day: str, progress_step: int) -> Dict:
    try:
        rng = np.random.default_rng(seed)
        days_df = list_available_days(limit=100000)
        if days_df.empty:
            print(f"[w{worker_id}] [err] нет доступных дат в lw_ledger", flush=True)
            return _agg_init(WINNERS_COUNT.keys())

        days = days_df["d"].astype(str).tolist()

        def pick_day(_i):
            return fixed_day if fixed_day else rng.choice(days)

        current_day = pick_day(0)
        mid_cache = prep_day_frame(current_day)
        tries = 0
        while mid_cache.empty and tries < 100:
            current_day = rng.choice(days)
            mid_cache = prep_day_frame(current_day)
            tries += 1
        if mid_cache.empty:
            print(f"[w{worker_id}] [err] не удалось подготовить mid-кэш для дня", flush=True)
            return _agg_init(WINNERS_COUNT.keys())

        acc = _agg_init(WINNERS_COUNT.keys())

        for i in range(runs):
            if not fixed_day and (i % 1000 == 0) and i > 0:
                current_day = pick_day(i)
                mid_cache = prep_day_frame(current_day)
                tries = 0
                while mid_cache.empty and tries < 100:
                    current_day = rng.choice(days)
                    mid_cache = prep_day_frame(current_day)
                    tries += 1
                if mid_cache.empty:
                    continue

            out, gsel = sample_once_with_topup(mid_cache, rng)
            if out.empty:
                _agg_update(acc, 0.0, 0, False, {g: 0 for g in WINNERS_COUNT.keys()})
            else:
                sr = float(out["final_reward"].sum())
                wn = int(out["email_norm"].nunique())
                neg = bool((out["final_reward"] < 0).any())
                for g in WINNERS_COUNT.keys():
                    if g not in gsel:
                        gsel[g] = 0
                _agg_update(acc, sr, wn, neg, gsel)

            if progress_step > 0 and (i + 1) % progress_step == 0:
                print(f"[w{worker_id}][progress] {i+1}/{runs}", flush=True)

        return acc

    except Exception as e:
        print(f"[w{worker_id}] [fatal] {e}", flush=True)
        traceback.print_exc()
        return _agg_init(WINNERS_COUNT.keys())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=100000, help="общее число прогонов")
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 2, help="число воркеров")
    ap.add_argument("--day", help="фиксированная дата YYYY-MM-DD; иначе случайные дни")
    ap.add_argument("--seed", type=int, default=42, help="seed для генератора")
    args = ap.parse_args()

    PROGRESS_STEP = int(os.getenv("LW_PROGRESS_STEP", "25000"))
    USE_THREADS = os.getenv("LW_USE_THREADS", "0") == "1"

    workers = max(1, int(args.workers))
    total_runs = int(args.runs)

    base = total_runs // workers
    rem = total_runs % workers
    runs_per_worker = [base + (1 if i < rem else 0) for i in range(workers)]

    seeds = [args.seed + i * 9973 for i in range(workers)]

    print(f"=== Monte-Carlo PARALLEL ===")
    print(f"total runs: {total_runs}, workers: {workers}, progress step: {PROGRESS_STEP}")
    print(f"executor: {'threads' if USE_THREADS else 'processes'}")
    if args.day:
        print(f"day mode: fixed {args.day}")
    else:
        print(f"day mode: random days")

    results = []
    Executor = ThreadPoolExecutor if USE_THREADS else ProcessPoolExecutor
    with Executor(max_workers=workers) as ex:
        futs = []
        for i in range(workers):
            fut = ex.submit(_worker, i, runs_per_worker[i], seeds[i], args.day, PROGRESS_STEP)
            futs.append(fut)
        for fut in as_completed(futs):
            results.append(fut.result())

    agg = _agg_init(WINNERS_COUNT.keys())
    for r in results:
        agg = _agg_merge(agg, r)

    if agg["runs"] == 0:
        print("[err] нет результатов")
        return

    sr_min  = agg["sum_rewards_min"]
    sr_max  = agg["sum_rewards_max"]
    sr_mean = agg["sum_rewards_sum"] / agg["runs"]

    wn_min  = agg["winners_min"]
    wn_max  = agg["winners_max"]
    wn_mean = agg["winners_sum"] / agg["runs"]

    print("=== Monte-Carlo summary ===")
    print(f"runs: {agg['runs']}")
    print(f"sum(final_reward):  min={sr_min:.2f}, mean={sr_mean:.2f}, max={sr_max:.2f} (ожидаем ≈{float(os.getenv('LW_PRIZE','500')):.2f})")
    print(f"winners count:      min={wn_min:.0f}, mean={wn_mean:.2f}, max={wn_max:.0f}")
    print(f"negative rewards:   {agg['neg_rewards']} / {agg['runs']}  (ожидаем 0)")
    print("by-group selected (min/mean/max):")
    for g in WINNERS_COUNT:
        gmin  = agg["per_group"][g]["min"]
        gmax  = agg["per_group"][g]["max"]
        gmean = agg["per_group"][g]["sum"] / agg["runs"]
        print(f"  {g:<8} -> min={gmin:.0f}, mean={gmean:.2f}, max={gmax:.0f}  (quota={WINNERS_COUNT[g]})")

if __name__ == "__main__":
    main()
