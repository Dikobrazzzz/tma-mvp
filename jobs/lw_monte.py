#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Monte-Carlo проверка механики winners:
- выбирает дату (фиксированную или случайную из lw_ledger)
- R раз делает выбор победителей и расчёт наград (без записи в БД)
- печатает min/avg/max суммарной награды, кол-ва победителей, распределение по группам
- проверяет наличие отрицательных наград
"""

import os
import argparse
import numpy as np
import pandas as pd
import psycopg
from datetime import datetime, timezone
# забираем функции из lw_job.py
from lw_job import (
    dsn, read_ledger, compute_daily_mu_sigma, classify_group,
    compute_metrics_and_rewards, WINNERS_COUNT
)

def list_available_days(limit=10000):
    sql = """
    SELECT date_ts::date AS d, COUNT(*) AS rows, COUNT(DISTINCT email_norm) AS participants
    FROM lw_ledger
    WHERE email_norm IS NOT NULL
      AND date_ts::date <> DATE '1970-01-01'
    GROUP BY 1
    HAVING COUNT(DISTINCT email_norm) > 0
    ORDER BY d
    LIMIT %s
    """
    with psycopg.connect(dsn()) as con:
        df = pd.read_sql(sql, con, params=[limit])
    return df

def prep_day_frame(day_str):
    """Готовим mid-фрейм на дату: фильтры, выбросы, группы."""
    d_from = datetime.fromisoformat(day_str).replace(tzinfo=timezone.utc)
    d_to   = d_from + pd.Timedelta(days=1)
    df = read_ledger(d_from, d_to)
    if df.empty:
        return pd.DataFrame()
    daily = df[df["Date"] == pd.to_datetime(day_str).date()].copy()
    mid, mu, sigma = compute_daily_mu_sigma(daily)
    if mid.empty:
        return pd.DataFrame()
    mid["group"] = mid.apply(lambda r: classify_group(r, mu, sigma), axis=1)
    mid = mid[mid["group"] != "Other"].copy()
    return mid

def sample_once(mid: pd.DataFrame, rng: np.random.Generator):
    """
    Сэмплим победителей по группам с равными шансами (без истории стриков).
    Возвращаем (df_winners, group_counts_selected)
    """
    parts = []
    selected_counts = {}
    for gname, grp in mid.groupby("group"):
        need = WINNERS_COUNT.get(gname, 0)
        emails = grp["email_norm"].unique()
        k = min(need, len(emails))
        if k <= 0:
            selected_counts[gname] = 0
            continue
        idx = rng.choice(len(emails), size=k, replace=False)
        chosen = set(emails[idx])
        picked = grp[grp["email_norm"].isin(chosen)].copy()
        parts.append(picked)
        selected_counts[gname] = picked["email_norm"].nunique()
    if not parts:
        return pd.DataFrame(), selected_counts
    winners = pd.concat(parts, ignore_index=True)
    out = compute_metrics_and_rewards(winners)
    return out, selected_counts

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=10000, help="число прогонов (e.g. 1000000)")
    ap.add_argument("--day", help="фиксированная дата YYYY-MM-DD; если не задано — случайная каждые 1000 итераций")
    ap.add_argument("--seed", type=int, default=42, help="seed для воспроизводимости")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)

    # подготовим набор доступных дней
    days_df = list_available_days(limit=100000)
    if days_df.empty:
        print("[err] нет доступных дат в lw_ledger")
        return
    days = days_df["d"].astype(str).tolist()

    # кеш mid-фрейма для текущей выбранной даты
    def pick_day(i):
        # если зафиксирована дата — всегда она
        if args.day:
            return args.day
        # иначе меняем день блоками по 1000 итераций (экономим SQL/CPU)
        return rng.choice(days)

    current_day = pick_day(0)
    mid_cache = prep_day_frame(current_day)
    # если вдруг пусто — перекидываемся на ближайшую с участниками
    while mid_cache.empty:
        current_day = rng.choice(days)
        mid_cache = prep_day_frame(current_day)

    # агрегаторы
    sum_rewards = []
    n_winners = []
    neg_rewards = 0
    per_group_counts = {g: [] for g in WINNERS_COUNT.keys()}

    for i in range(args.runs):
        # смена дня периодически, если не фиксирован
        if not args.day and (i % 1000 == 0) and i > 0:
            current_day = pick_day(i)
            mid_cache = prep_day_frame(current_day)
            while mid_cache.empty:
                current_day = rng.choice(days)
                mid_cache = prep_day_frame(current_day)

        out, gsel = sample_once(mid_cache, rng)
        if out.empty:
            # нет победителей (например, группа пустая) — фиксируем нули
            sum_rewards.append(0.0)
            n_winners.append(0)
            for g in per_group_counts:
                per_group_counts[g].append(0)
            continue

        total = float(out["final_reward"].sum())
        sum_rewards.append(total)
        winners_cnt = int(out["email_norm"].nunique())
        n_winners.append(winners_cnt)

        if (out["final_reward"] < 0).any():
            neg_rewards += 1

        for g in per_group_counts:
            per_group_counts[g].append(int(gsel.get(g, 0)))

    # сводка
    def stat(arr):
        a = np.array(arr, dtype=float)
        return float(a.min()), float(a.mean()), float(a.max())

    sr_min, sr_mean, sr_max = stat(sum_rewards)
    wn_min, wn_mean, wn_max = stat(n_winners)

    print("=== Monte-Carlo summary ===")
    print(f"runs: {args.runs}")
    print(f"day mode: {'fixed ' + args.day if args.day else 'random days'}")
    print(f"sum(final_reward):  min={sr_min:.2f}, mean={sr_mean:.2f}, max={sr_max:.2f} (ожидаем близко к 500.00)")
    print(f"winners count:      min={wn_min:.0f}, mean={wn_mean:.2f}, max={wn_max:.0f}")
    print(f"negative rewards:   {neg_rewards} / {args.runs}  (ожидаем 0)")
    print("by-group selected (min/mean/max):")
    for g in WINNERS_COUNT:
        gmin, gmean, gmax = stat(per_group_counts[g])
        print(f"  {g:<8} -> min={gmin:.0f}, mean={gmean:.2f}, max={gmax:.0f}  (quota={WINNERS_COUNT[g]})")

if __name__ == "__main__":
    main()
