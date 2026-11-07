/**
 * Проверка логики вне Google: загрузка API с пагинацией и повторами, расчёты воронки, сортировка.
 * Сервисы Apps Script (UrlFetchApp, Utilities) подменяются заглушками, страницы берутся из api/.
 * Запуск: node --test tests/funnel.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PAGES = path.join(ROOT, 'api', 'v1', 'sales-funnel');
const BASE = 'https://example.test/api/v1/sales-funnel/';

/** Загружает .gs-файлы в общий контекст, как это делает Apps Script. */
function loadScripts(fetchImpl) {
  const ctx = {
    console,
    sleeps: [],
    UrlFetchApp: { fetch: fetchImpl },
    Utilities: { sleep: (ms) => ctx.sleeps.push(ms) },
  };
  vm.createContext(ctx);
  for (const file of ['Config.gs', 'Funnel.gs', 'Api.gs']) {
    // const в общем контексте vm не видны снаружи — переводим в var только для теста.
    const code = fs.readFileSync(path.join(ROOT, 'apps-script', file), 'utf8').replace(/^const /gm, 'var ');
    vm.runInContext(code, ctx, { filename: file });
  }
  return ctx;
}

function response(code, body) {
  return { getResponseCode: () => code, getContentText: () => body };
}

/** Заглушка API, отдающая сгенерированные страницы с диска. */
function fileApi(calls) {
  return (url) => {
    calls.push(url);
    const file = path.join(PAGES, url.slice(BASE.length));
    return fs.existsSync(file) ? response(200, fs.readFileSync(file, 'utf8')) : response(404, '');
  };
}

const firstPage = JSON.parse(fs.readFileSync(path.join(PAGES, 'page-1.json'), 'utf8'));

test('загрузка проходит все страницы до next_page = null', () => {
  const calls = [];
  const s = loadScripts(fileApi(calls));
  const records = s.fetchAllRecords(BASE.slice(0, -1)); // без слэша в конце тоже работает
  assert.equal(records.length, firstPage.total_items);
  assert.equal(calls.length, firstPage.total_pages);
  assert.ok(calls[0].endsWith('/page-1.json'));
});

test('временная ошибка 503 повторяется, 404 — нет', () => {
  let n = 0;
  const flaky = loadScripts((url) => {
    n++;
    if (n === 1) return response(503, '');
    return fileApi([])(url);
  });
  assert.equal(flaky.fetchAllRecords(BASE).length, firstPage.total_items);
  assert.deepEqual(flaky.sleeps, [1000]);

  let calls404 = 0;
  const missing = loadScripts(() => { calls404++; return response(404, ''); });
  assert.throws(() => missing.fetchAllRecords(BASE), /404/);
  assert.equal(calls404, 1);

  const down = loadScripts(() => response(500, ''));
  assert.throws(() => down.fetchAllRecords(BASE), /после 3 попыток/);
  assert.deepEqual(down.sleeps, [1000, 2000]);
});

test('битая страница не принимается', () => {
  const bad = (mutate) => loadScripts(() => {
    const p = JSON.parse(JSON.stringify(firstPage));
    mutate(p);
    return response(200, JSON.stringify(p));
  });
  assert.throws(() => bad((p) => { p.next_page = 5; }).fetchAllRecords(BASE), /next_page/);
  assert.throws(() => bad((p) => { delete p.items[3].orders; }).fetchAllRecords(BASE), /orders/);
  assert.throws(() => bad((p) => { p.items = null; }).fetchAllRecords(BASE), /items/);
  assert.throws(() => loadScripts(fileApi([])).fetchAllRecords('http://insecure'), /https/);
});

test('воронка: суммы и конверсии', () => {
  const s = loadScripts(fileApi([]));
  const records = s.fetchAllRecords(BASE);
  const totals = s.sumTotals(records);
  const rows = s.funnelRows(totals);

  assert.equal(rows.length, 5);
  assert.equal(rows[0][2], 1);
  assert.equal(rows[4][1], totals.buyouts);
  // Конверсия этапа = этап / предыдущий; от показов = этап / показы.
  assert.ok(Math.abs(rows[3][2] - totals.orders / totals.add_to_cart) < 1e-12);
  assert.ok(Math.abs(rows[4][3] - totals.buyouts / totals.impressions) < 1e-12);
  // Выручка = выкупы × цена в каждой записи.
  records.forEach((r) => assert.equal(r.revenue, r.buyouts * r.price));
  assert.ok(Math.abs(s.kpis(totals).avgCheck - totals.revenue / totals.buyouts) < 1e-9);
});

test('фильтр по периоду и категории', () => {
  const s = loadScripts(fileApi([]));
  const records = s.fetchAllRecords(BASE);
  const oct = s.filterRecords(records, '2026-10-01', '2026-10-31', 'Все');
  assert.ok(oct.length > 0 && oct.every((r) => r.date >= '2026-10-01' && r.date <= '2026-10-31'));
  assert.equal(oct.length, 31 * 18);
  const sport = s.filterRecords(records, '', '', 'Спорт');
  assert.ok(sport.length > 0 && sport.every((r) => r.category === 'Спорт'));
  assert.equal(s.filterRecords(records, '', '', 'Все').length, records.length);
});

test('отчёт: сортировка и выявление проблемного товара', () => {
  const s = loadScripts(fileApi([]));
  const products = s.aggregateBy(s.fetchAllRecords(BASE), 'sku');
  assert.equal(products.length, 18);

  const byRevenue = s.sortRows(products, 'revenue', true);
  for (let i = 1; i < byRevenue.length; i++) assert.ok(byRevenue[i - 1].revenue >= byRevenue[i].revenue);

  // Наушники с низким выкупом должны оказаться первыми при сортировке выкупа по возрастанию.
  const byBuyout = s.sortRows(products, s.sortFieldByTitle('Процент выкупа'), false);
  assert.equal(byBuyout[0].sku, 'EL-4202');

  const byName = s.sortRows(products, 'name', false);
  assert.equal(byName[0].name.localeCompare(byName[1].name, 'ru') <= 0, true);
  assert.equal(s.sortFieldByTitle('неизвестно'), 'revenue');
});

test('распродажа 11–13 октября видна в динамике по дням', () => {
  const s = loadScripts(fileApi([]));
  const daily = s.dailyRows(s.fetchAllRecords(BASE));
  assert.equal(daily.length, 60);
  const revenue = Object.fromEntries(daily.map(([d, , r]) => [d, r]));
  const promo = (revenue['2026-10-11'] + revenue['2026-10-12'] + revenue['2026-10-13']) / 3;
  const before = (revenue['2026-10-04'] + revenue['2026-10-05'] + revenue['2026-10-06']) / 3;
  assert.ok(promo > before * 1.5, `promo ${promo} vs before ${before}`);
});

test('полоски воронки: логарифмическая длина, все этапы видны', () => {
  const s = loadScripts(fileApi([]));
  const bars = s.funnelBars([10851726, 556928, 60305, 22770, 19822, 0], 40);
  assert.equal(bars[0].length, 40);
  for (let i = 1; i < 5; i++) {
    assert.ok(bars[i].length >= 1 && bars[i].length <= bars[i - 1].length, `этап ${i}: ${bars[i].length}`);
  }
  assert.equal(bars[5], '');
  assert.ok(/^█+$/.test(bars[4]));
});
