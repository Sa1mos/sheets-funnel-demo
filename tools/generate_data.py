"""Генератор данных мок-API: дневная воронка продаж по товарам маркетплейса.

Данные детерминированы (фиксированный seed): повторный запуск даёт те же файлы.
Запуск: python tools/generate_data.py
Результат: api/v1/sales-funnel/page-N.json
"""

from __future__ import annotations

import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20261107
DAYS = 60
END_DATE = date(2026, 11, 6)
PER_PAGE = 250
OUT_DIR = Path(__file__).resolve().parent.parent / "api" / "v1" / "sales-funnel"

# sku, название, категория, цена, базовые показы в день,
# конверсии: показ→карточка, карточка→корзина, корзина→заказ, заказ→выкуп
PRODUCTS = [
    ("KT-1042", "Термокружка 450 мл", "Кухня", 890, 9000, 0.055, 0.11, 0.38, 0.90),
    ("KT-1107", "Набор ножей 5 шт", "Кухня", 2490, 5200, 0.048, 0.09, 0.34, 0.86),
    ("KT-1215", "Сковорода 28 см антипригарная", "Кухня", 1790, 6100, 0.051, 0.10, 0.36, 0.88),
    ("KT-1330", "Контейнеры для еды, 6 шт", "Кухня", 690, 11000, 0.062, 0.13, 0.41, 0.91),
    ("HM-2011", "Плед флисовый 150×200", "Дом", 1290, 8000, 0.058, 0.12, 0.37, 0.87),
    ("HM-2054", "Органайзер для шкафа", "Дом", 590, 12500, 0.045, 0.08, 0.33, 0.89),
    ("HM-2120", "Ночник с датчиком движения", "Дом", 990, 7400, 0.064, 0.14, 0.40, 0.84),
    ("HM-2188", "Набор вешалок 10 шт", "Дом", 450, 9800, 0.041, 0.09, 0.42, 0.93),
    ("SP-3005", "Коврик для йоги 6 мм", "Спорт", 1490, 6800, 0.060, 0.12, 0.35, 0.85),
    ("SP-3042", "Гантели разборные 2×5 кг", "Спорт", 3290, 3900, 0.052, 0.08, 0.31, 0.82),
    ("SP-3117", "Скакалка скоростная", "Спорт", 490, 10200, 0.047, 0.10, 0.44, 0.92),
    ("SP-3160", "Бутылка для воды 750 мл", "Спорт", 650, 8700, 0.050, 0.11, 0.39, 0.90),
    ("EL-4021", "Кабель USB-C 2 м, оплётка", "Электроника", 390, 15000, 0.039, 0.10, 0.46, 0.94),
    ("EL-4088", "Беспроводная зарядка 15 Вт", "Электроника", 1390, 7600, 0.053, 0.09, 0.33, 0.80),
    ("EL-4136", "Держатель для телефона в авто", "Электроника", 790, 9300, 0.049, 0.10, 0.37, 0.88),
    ("EL-4202", "Наушники-вкладыши TWS", "Электроника", 2190, 6400, 0.066, 0.12, 0.30, 0.62),
    ("BT-5014", "Массажная щётка для лица", "Красота", 1190, 5900, 0.057, 0.11, 0.35, 0.79),
    ("BT-5063", "Органайзер для косметики", "Красота", 990, 7100, 0.044, 0.09, 0.38, 0.90),
]


def noisy(rng: random.Random, value: float, spread: float) -> float:
    """Значение со случайным отклонением ±spread (доля), не ниже нуля."""
    return max(0.0, value * (1 + rng.uniform(-spread, spread)))


def binomial(rng: random.Random, n: int, p: float) -> int:
    """Биномиальное распределение: нормальное приближение для больших n."""
    if n <= 0 or p <= 0:
        return 0
    if n > 50:
        mean, sd = n * p, math.sqrt(n * p * (1 - p))
        return max(0, min(n, round(rng.gauss(mean, sd))))
    return sum(1 for _ in range(n) if rng.random() < p)


def generate() -> list[dict]:
    rng = random.Random(SEED)
    start = END_DATE - timedelta(days=DAYS - 1)
    records: list[dict] = []

    for day_index in range(DAYS):
        day = start + timedelta(days=day_index)
        weekday = day.weekday()
        # Выходные сильнее по трафику, плюс плавный рост к концу периода.
        weekly = 1.18 if weekday >= 5 else (0.94 if weekday == 0 else 1.0)
        trend = 1 + 0.25 * day_index / DAYS
        # «Распродажа» 11–13 октября: трафик и конверсия выше.
        promo = 1.6 if date(2026, 10, 11) <= day <= date(2026, 10, 13) else 1.0

        for sku, name, category, price, base, ctr, to_cart, to_order, buyout in PRODUCTS:
            impressions = round(noisy(rng, base * weekly * trend * promo, 0.18))
            card_views = binomial(rng, impressions, noisy(rng, ctr, 0.12))
            add_to_cart = binomial(rng, card_views, noisy(rng, to_cart * (1.15 if promo > 1 else 1), 0.15))
            orders = binomial(rng, add_to_cart, noisy(rng, to_order, 0.12))
            buyouts = binomial(rng, orders, noisy(rng, buyout, 0.05))
            records.append(
                {
                    "date": day.isoformat(),
                    "sku": sku,
                    "name": name,
                    "category": category,
                    "price": price,
                    "impressions": impressions,
                    "card_views": card_views,
                    "add_to_cart": add_to_cart,
                    "orders": orders,
                    "buyouts": buyouts,
                    "revenue": buyouts * price,
                }
            )
    return records


def write_pages(records: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("page-*.json"):
        old.unlink()

    total_pages = math.ceil(len(records) / PER_PAGE)
    for page in range(1, total_pages + 1):
        chunk = records[(page - 1) * PER_PAGE : page * PER_PAGE]
        payload = {
            "page": page,
            "per_page": PER_PAGE,
            "total_items": len(records),
            "total_pages": total_pages,
            "next_page": page + 1 if page < total_pages else None,
            "currency": "RUB",
            "items": chunk,
        }
        (OUT_DIR / f"page-{page}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    print(f"{len(records)} записей, {total_pages} страниц → {OUT_DIR}")


if __name__ == "__main__":
    write_pages(generate())
