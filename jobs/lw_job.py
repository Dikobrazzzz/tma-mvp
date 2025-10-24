#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lucky Winners job — реализация механики из LW.ipynb:
- окно дат (по умолчанию: вчера UTC)
- исключение выбросов (двуххвостовой квантиль 2.5% / 97.5% по GGR)
- μ, σ по очищенным данным
- группы (G1..G4) по правилам
- выбор победителей по группам с ограничением серийных побед
- начисление PRIZE=500 по метрикам sqrt/log1p/Z-score и group weights
- нормализация до ровно 500 EUR на день
- UPSERT в lw_winners по (draw_id, email_norm)

Управление через ENV (дефолты ниже):
  LW_PRIZE=500
  LW_TAIL_Q=0.025
  LW_G1_STD_SHIFT=0.5
  LW_LOW_SIGMA=2.0
  LW_VIP_DEFAULT=3
  LW_WIN_G1=9 LW_WIN_G2=10 LW_WIN_G3=4 LW_WIN_G4=2
  LW_W_G1=0.5 LW_W_G2=1.0 LW_W_G3=2.0 LW_W_G4=2.0
  LW_M_SQRT=0.5 LW_M_LN=0.3 LW_M_Z=0.2
  LW_MAX_CONSEC=4 LW_MIN_CHANCE=0.0 LW_MAX_CHANCE=0.1
  LW_GGR_MIN_ABS=1.0
  LW_REQUIRE_TURNOVER_POS=0
  LW_PG_DSN=postgresql://tma:tma@127.0.0.1:5432/tma
"""

import os
import argparse
from datetime import date, datetime, timedelta, timezone
import numpy as np
import pandas as pd
import psycopg


# ----- Параметры механики -----
PRIZE = float(os.getenv("LW_PRIZE", "500"))
TAIL_Q = float(os.getenv("LW_TAIL_Q", "0.025"))            # квантиль для выбросов
G1_STD_SHIFT = float(os.getenv("LW_G1_STD_SHIFT", "0.5"))  # μ + 0.5σ
LOW_SIGMA = float(os.getenv("LW_LOW_SIGMA", "2.0"))        # μ - 2σ
VIP_DEFAULT = int(os.getenv("LW_VIP_DEFAULT", "3"))

WINNERS_COUNT = {
    "Group 1": int(os.getenv("LW_WIN_G1", "9")),
    "Group 2": int(os.getenv("LW_WIN_G2", "10")),
    "Group 3": int(os.getenv("LW_WIN_G3", "4")),
    "Group 4": int(os.getenv("LW_WIN_G4", "2")),
}

GROUP_WEIGHTS = {
    "Group 1": float(os.getenv("LW_W_G1", "0.5")),
    "Group 2": float(os.getenv("LW_W_G2", "1.0")),
    "Group 3": float(os.getenv("LW_W_G3", "2.0")),
    "Group 4": float(os.getenv("LW_W_G4", "2.0")),
}

METRIC_WEIGHTS = {  # sqrt / ln / Z-score
    "sqrt": float(os.getenv("LW_M_SQRT", "0.5")),
    "ln": float(os.getenv("LW_M_LN", "0.3")),
    "Z": float(os.getenv("LW_M_Z", "0.2")),
}

MAX_CONSEC_WINS = int(os.getenv("LW_MAX_CONSEC", "4"))
MIN_CHANCE = float(os.getenv("LW_MIN_CHANCE", "0.0"))
MAX_CHANCE = float(os.getenv("LW_MAX_CHANCE", "0.1"))

# Фильтр входящих строк, чтобы «не все подряд»
GGR_MIN_ABS = float(os.getenv("LW_GGR_MIN_ABS", "1.0"))               # минимальный |GGR|
REQUIRE_TURNOVER_POS = os.getenv("LW_REQUIRE_TURNOVER_POS", "0") == "1"  # требовать turnover > 0


# ----- Утиль -----

def dsn():
    return os.getenv("LW_PG_DSN", "postgresql://tma:tma@127.0.0.1:5432/tma")


def utc_day_bounds(day: date):
    start = datetime.combine(day, datetime.min.time()).replace(tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def read_ledger(d_from, d_to) -> pd.DataFrame:
    """
    Читаем lw_ledger за окно. Если нет столбца VIP — подставим VIP_DEFAULT.
    Фильтруем «слабые» записи по GGR и, опционально, по turnover.
    """
    sql = """
    SELECT
      COALESCE(user_id, 0) AS user_id,
      email_norm,
      date_ts::date AS d,
      ggr,
      inout,
      turnover,
      deposit_amount,
      NULL::int AS vip_level
    FROM lw_ledger
    WHERE date_ts >= %s AND date_ts < %s
      AND email_norm IS NOT NULL
      AND date_ts::date <> DATE '1970-01-01'
    """
    with psycopg.connect(dsn()) as con:
        df = pd.read_sql(sql, con, params=[d_from, d_to])

    if df.empty:
        return df

    # VIP заглушка: если в данных нет VIP — ставим дефолт (например, 3)
    df["vip_level"] = df["vip_level"].fillna(VIP_DEFAULT).replace({0: VIP_DEFAULT})

    df.rename(columns={
        "d": "Date",
        "user_id": "AccountID",
        "inout": "NetCashEUR",
        "deposit_amount": "DepositAmount",
        "ggr": "GGR",
    }, inplace=True)

    # --- ФИЛЬТРЫ ---
    # 1) Порог по |GGR|
    df = df[df["GGR"].abs() >= GGR_MIN_ABS]

    # 2) (Опционально) требовать положительный оборот
    if REQUIRE_TURNOVER_POS:
        df = df[df["turnover"].fillna(0) > 0]

    # оставляем ключевые поля
    return df[["Date", "AccountID", "email_norm", "GGR", "NetCashEUR", "turnover", "DepositAmount", "vip_level"]]


def compute_daily_mu_sigma(df_day: pd.DataFrame):
    """
    Исключаем выбросы по GGR (двуххвостовой TAIL_Q/1-TAIL_Q), считаем μ/σ на очищенных.
    Возвращаем очищенный df (без high/low outliers), mu, sigma.
    """
    ggr = df_day["GGR"].astype(float)
    q_low = np.quantile(ggr, TAIL_Q)
    q_high = np.quantile(ggr, 1 - TAIL_Q)

    mask_mid = (ggr >= q_low) & (ggr <= q_high)
    mid = df_day.loc[mask_mid].copy()
    if mid.empty:
        # fallback: если всё улетело, используем весь день
        mid = df_day.copy()
    mu = float(mid["GGR"].mean())
    sigma = float(mid["GGR"].std(ddof=0) or 1e-6)

    # финальный набор для классификации: исключаем верхние/нижние выбросы
    final = mid  # mid уже без выбросов
    return final.reset_index(drop=True), mu, sigma


def classify_group(row, mu: float, sigma: float) -> str:
    """
    Правила:
    - Group 1: GGR > μ + 0.5σ
    - Group 2: 0 ≤ GGR ≤ μ
    - Group 3: GGR < 0 и GGR ≥ μ − 2σ
    - Group 4: GGR < μ − 2σ и VIP ≥ 2
    - Other: остальное
    """
    g = float(row["GGR"])
    vip = int(row["vip_level"])
    if g > mu + G1_STD_SHIFT * sigma:
        return "Group 1"
    if (g >= 0.0) and (g <= mu):
        return "Group 2"
    if (g < 0.0) and (g >= mu - LOW_SIGMA * sigma):
        return "Group 3"
    if (g < mu - LOW_SIGMA * sigma) and (vip >= 2):
        return "Group 4"
    return "Other"


def fetch_consecutive_wins_before(d_from: datetime) -> dict:
    """
    Достаём последнее состояние серийных побед из истории winners до начала окна.
    Считаем стрики (кол-во подряд дней до ближайшего к окну).
    """
    with psycopg.connect(dsn()) as con:
        df = pd.read_sql("""
            SELECT draw_id, email_norm
            FROM lw_winners
            WHERE draw_id < %s
              AND draw_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              AND computed_at >= now() - interval '60 days'
            ORDER BY draw_id DESC
        """, con, params=[d_from.date().isoformat()])

    if df.empty:
        return {}

    # считаем стрики по email_norm «вчера, позавчера, ...» до разрыва
    streaks = {}
    for email, g in df.groupby("email_norm"):
        dates = sorted(g["draw_id"].unique(), reverse=True)
        s = 0
        last = None
        for d in dates:
            if last is None:
                s = 1
                last = d
            else:
                prev = datetime.fromisoformat(last) - timedelta(days=1)
                if d == prev.date().isoformat():
                    s += 1
                    last = d
                else:
                    break
        streaks[email] = s
    return streaks


def weighted_choice(emails, k, prev_winners: set, consec: dict, group_name: str):
    """
    Взвешенная безповторная выборка:
    - игрокам из prev_winners добавляем шанс, но не более MAX_CONSEC_WINS
    - «новые» тоже получают шанс
    """
    if k <= 0 or not emails:
        return []
    k = min(k, len(emails))
    w = []
    for e in emails:
        base = 1.0
        if e in prev_winners and consec.get(e, 0) < MAX_CONSEC_WINS:
            base += np.random.uniform(MIN_CHANCE, MAX_CHANCE)
        elif e not in consec or group_name == "Outliers":
            base += np.random.uniform(MIN_CHANCE, MAX_CHANCE)
        w.append(base)
    w = np.array(w, dtype=float)
    w /= w.sum()
    idx = np.random.choice(len(emails), size=k, replace=False, p=w)
    return [emails[i] for i in idx]


def pick_group_winners(df_group: pd.DataFrame, need: int, prev_winners: set, consec: dict, group_name: str) -> pd.DataFrame:
    emails = df_group["email_norm"].unique().tolist()
    chosen = weighted_choice(emails, need, prev_winners, consec, group_name)
    wins = df_group[df_group["email_norm"].isin(chosen)].copy()
    # мягко обновим счётчик серий
    for e in chosen:
        consec[e] = min(MAX_CONSEC_WINS, consec.get(e, 0) + 1 if e in prev_winners else 1)
    return wins


def compute_metrics_and_rewards(df_day: pd.DataFrame) -> pd.DataFrame:
    # метрики на победителях дня (все группы вместе)
    g = df_day["GGR"].astype(float).to_numpy()
    df_day["sqrt"] = np.sqrt(np.abs(g))
    df_day["ln"]   = np.log1p(np.abs(g))  # всегда >= 0
    mu = float(np.mean(g))
    sd = float(np.std(g) or 1e-6)
    df_day["Z"] = np.abs((g - mu) / sd)

    out = df_day.copy()

    # нормируем каждую метрику на PRIZE (с защитой от нулей)
    for m in ["sqrt", "ln", "Z"]:
        s = float(out[m].sum())
        out[f"{m}_share"] = 0.0 if s <= 0 else out[m] / s * PRIZE

    out["base_reward"] = (
        out["sqrt_share"] * METRIC_WEIGHTS["sqrt"] +
        out["ln_share"]   * METRIC_WEIGHTS["ln"]   +
        out["Z_share"]    * METRIC_WEIGHTS["Z"]
    )

    # корректировка по весам групп
    out["adj_reward"] = out["base_reward"]
    for gname, w in GROUP_WEIGHTS.items():
        out.loc[out["group"] == gname, "adj_reward"] *= w

    # нормализация до PRIZE и «не ниже базовой»
    total_adj = float(out["adj_reward"].sum())
    if total_adj > 0:
        out["final_reward"] = PRIZE * out["adj_reward"] / total_adj
        out["final_reward"] = np.maximum(out["final_reward"], out["base_reward"])
    else:
        out["final_reward"] = out["base_reward"]

    # последняя подгонка: сумма ровно PRIZE и без отрицательных значений
    total = float(out["final_reward"].sum())
    if total > 0:
        out["final_reward"] = np.round(PRIZE * out["final_reward"] / total, 2)
    out["final_reward"] = np.clip(out["final_reward"], 0.0, None)

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", help="YYYY-MM-DD (UTC inclusive)")
    ap.add_argument("--to", dest="date_to", help="YYYY-MM-DD (UTC exclusive)")
    ap.add_argument("--draw-id", dest="draw_id", help="идентификатор розыгрыша (по умолчанию = дата to-1)")
    ap.add_argument("--dry", action="store_true", help="не писать в БД, только превью")
    args = ap.parse_args()

    # окно по умолчанию — вчера (UTC)
    today = datetime.now(timezone.utc).date()
    if args.date_from and args.date_to:
        d_from = datetime.fromisoformat(args.date_from).replace(tzinfo=timezone.utc)
        d_to   = datetime.fromisoformat(args.date_to).replace(tzinfo=timezone.utc)
    else:
        d_from, d_to = utc_day_bounds(today - timedelta(days=1))
    draw_id = args.draw_id or (d_to.date().isoformat())  # «дата периода»

    # 1) данные
    df = read_ledger(d_from, d_to)
    if df.empty:
        print(f"[info] нет строк в lw_ledger за {d_from}..{d_to}")
        return

    # 2) готовим историю стриков по прошлым розыгрышам
    consec = fetch_consecutive_wins_before(d_from)  # dict[email] = streak
    prev_winners = set(consec.keys())

    all_day_winners = []
    for day in sorted(df["Date"].unique()):
        df_day = df[df["Date"] == day].copy()

        # выбросы → μ,σ на mid
        mid, mu, sigma = compute_daily_mu_sigma(df_day)

        # классификация групп
        mid["group"] = mid.apply(lambda r: classify_group(r, mu, sigma), axis=1)

        # берём победителей по группам (кроме Other) + лог по квотам
        day_wins_parts = []
        for (d, gname), grp in mid.groupby(["Date", "group"]):
            if gname == "Other":
                continue
            need = WINNERS_COUNT.get(gname, 0)
            cand = grp["email_norm"].nunique()
            if need <= 0 or grp.empty:
                print(f"[{day}] {gname}: candidates={cand}, picked=0 (skip)")
                continue
            sel = pick_group_winners(grp, need, prev_winners, consec, gname)
            picked = sel["email_norm"].nunique()
            print(f"[{day}] {gname}: candidates={cand}, picked={picked} (quota={need})")
            day_wins_parts.append(sel)

        if not day_wins_parts:
            continue

        day_wins = pd.concat(day_wins_parts, ignore_index=True)

        # начисление призов
        day_out = compute_metrics_and_rewards(day_wins)
        all_day_winners.append(day_out)

        # обновляем prev_winners
        prev_winners.update(day_out["email_norm"].unique().tolist())

    if not all_day_winners:
        print("[info] победителей не выбрано")
        return

    result = pd.concat(all_day_winners, ignore_index=True)

    print("[preview] первые 20 строк:")
    print(result[["Date", "email_norm", "AccountID", "group", "GGR", "final_reward"]].head(20))

    if args.dry:
        print("[dry-run] запись отключена")
        return

    # 3) запись в lw_winners (UPSERT по (draw_id, email_norm))
    with psycopg.connect(dsn()) as con, con.cursor() as cur:
        for _, r in result.iterrows():
            cur.execute("""
                INSERT INTO lw_winners (draw_id, user_id, email_norm, amount_eur, rank, reason)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (draw_id, email_norm) DO UPDATE
                  SET amount_eur = EXCLUDED.amount_eur,
                      rank       = EXCLUDED.rank,
                      reason     = EXCLUDED.reason,
                      computed_at= now();
            """, (
                draw_id,
                int(r["AccountID"]) if pd.notna(r["AccountID"]) else None,
                r["email_norm"],
                float(r["final_reward"]),
                0,  # при необходимости можно посчитать ранг внутри дня
                f"{r['group']} | GGR={round(float(r['GGR']), 2)}"
            ))
        con.commit()
    print(f"[ok] winners upserted for draw_id={draw_id}")


if __name__ == "__main__":
    main()
