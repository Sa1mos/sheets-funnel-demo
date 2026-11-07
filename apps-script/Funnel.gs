/**
 * Расчёты воронки. Чистые функции без обращения к таблице:
 * их можно проверить вне Google (см. tests/funnel.test.js).
 */

/** Этапы воронки по порядку. */
const STAGES = [
  { key: 'impressions', title: 'Показы' },
  { key: 'card_views', title: 'Переходы в карточку' },
  { key: 'add_to_cart', title: 'Добавления в корзину' },
  { key: 'orders', title: 'Заказы' },
  { key: 'buyouts', title: 'Выкупы' },
];

/** Деление без ошибок: при нулевом знаменателе — 0. */
function safeDiv(a, b) {
  return b ? a / b : 0;
}

/**
 * Отбор записей по периоду (строки ГГГГ-ММ-ДД, включительно) и категории.
 * Пустая граница периода — без ограничения.
 */
function filterRecords(records, dateFrom, dateTo, category) {
  return records.filter(function (r) {
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo && r.date > dateTo) return false;
    if (category && category !== ALL_CATEGORIES && r.category !== category) return false;
    return true;
  });
}

/** Суммы по всем этапам и выручке. */
function sumTotals(records) {
  const totals = { revenue: 0 };
  STAGES.forEach(function (s) { totals[s.key] = 0; });
  records.forEach(function (r) {
    STAGES.forEach(function (s) { totals[s.key] += Number(r[s.key]) || 0; });
    totals.revenue += Number(r.revenue) || 0;
  });
  return totals;
}

/**
 * Строки воронки: [этап, количество, конверсия из предыдущего этапа, конверсия от показов].
 * Для первого этапа обе конверсии — 100%.
 */
function funnelRows(totals) {
  const first = totals[STAGES[0].key];
  return STAGES.map(function (s, i) {
    const value = totals[s.key];
    const prev = i === 0 ? value : totals[STAGES[i - 1].key];
    return [s.title, value, i === 0 ? 1 : safeDiv(value, prev), i === 0 ? 1 : safeDiv(value, first)];
  });
}

/** Ключевые показатели периода. */
function kpis(totals) {
  return {
    revenue: totals.revenue,
    orders: totals.orders,
    buyouts: totals.buyouts,
    avgCheck: safeDiv(totals.revenue, totals.buyouts),
    buyoutRate: safeDiv(totals.buyouts, totals.orders),
    overallRate: safeDiv(totals.orders, totals.card_views),
  };
}

/** Добавляет к строке с суммами рассчитанные конверсии. */
function withRates(row) {
  row.ctr = safeDiv(row.card_views, row.impressions);
  row.cartRate = safeDiv(row.add_to_cart, row.card_views);
  row.orderRate = safeDiv(row.orders, row.card_views);
  row.buyoutRate = safeDiv(row.buyouts, row.orders);
  return row;
}

/** Группировка по полю (sku, category) с суммами и конверсиями. */
function aggregateBy(records, field) {
  const groups = {};
  records.forEach(function (r) {
    const id = r[field];
    if (!groups[id]) {
      groups[id] = { key: id, sku: r.sku, name: r.name, category: r.category };
      groups[id].revenue = 0;
      STAGES.forEach(function (s) { groups[id][s.key] = 0; });
    }
    const g = groups[id];
    STAGES.forEach(function (s) { g[s.key] += Number(r[s.key]) || 0; });
    g.revenue += Number(r.revenue) || 0;
  });
  return Object.keys(groups).map(function (id) { return withRates(groups[id]); });
}

/** Динамика по дням: [дата, заказы, выручка], по возрастанию даты. */
function dailyRows(records) {
  const byDay = {};
  records.forEach(function (r) {
    if (!byDay[r.date]) byDay[r.date] = { orders: 0, revenue: 0 };
    byDay[r.date].orders += Number(r.orders) || 0;
    byDay[r.date].revenue += Number(r.revenue) || 0;
  });
  return Object.keys(byDay).sort().map(function (d) {
    return [d, byDay[d].orders, byDay[d].revenue];
  });
}

/** Сортировка строк по полю: числа — численно, строки — по алфавиту (русская локаль). */
function sortRows(rows, field, descending) {
  const sign = descending ? -1 : 1;
  return rows.slice().sort(function (a, b) {
    const x = a[field];
    const y = b[field];
    const cmp = typeof x === 'string' || typeof y === 'string'
      ? String(x).localeCompare(String(y), 'ru')
      : x - y;
    return cmp * sign || String(a.key).localeCompare(String(b.key));
  });
}

/** Поле сортировки по подписи из выпадающего списка; по умолчанию — выручка. */
function sortFieldByTitle(title) {
  const option = SORT_OPTIONS.filter(function (o) { return o.title === title; })[0];
  return option ? option.field : 'revenue';
}

/* Экспорт для тестов в Node.js; в Apps Script переменной module нет. */
if (typeof module !== 'undefined') {
  module.exports = {
    STAGES, safeDiv, filterRecords, sumTotals, funnelRows, kpis,
    withRates, aggregateBy, dailyRows, sortRows, sortFieldByTitle,
  };
}
