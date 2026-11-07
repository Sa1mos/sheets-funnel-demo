/**
 * Работа с листами: первичная настройка, запись данных, отрисовка воронки и отчёта, журнал.
 */

const FMT = {
  int: '#,##0',
  money: '#,##0" ₽"',
  percent: '0.0%',
  date: 'dd.mm.yyyy',
};

// ---------- Первичная настройка ----------

/** Создаёт листы, подписи, списки и форматы. Безопасно запускать повторно: введённые настройки сохраняются. */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (k, i) { getOrCreateSheet(ss, SHEETS[k], i); });
  setupSettingsSheet(ss.getSheetByName(SHEETS.settings));
  setupDataSheet(ss.getSheetByName(SHEETS.data));
  setupReportControls(ss.getSheetByName(SHEETS.report));
  setupLogSheet(ss.getSheetByName(SHEETS.log));

  // Лишний стандартный «Лист1», если он пустой.
  ['Лист1', 'Sheet1'].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  ss.setActiveSheet(ss.getSheetByName(SHEETS.settings));
}

function getOrCreateSheet(ss, name, index) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name, index);
  return sheet;
}

function setupSettingsSheet(sh) {
  sh.getRange('A1').setValue('Воронка продаж маркетплейса — настройки').setFontSize(16).setFontWeight('bold');

  const labels = [
    ['A3', 'Адрес API', 'Базовый адрес: к нему добавляется page-1.json, page-2.json…'],
    ['A4', 'Период с', 'Пусто — с первой даты в данных'],
    ['A5', 'Период по', 'Пусто — до последней даты в данных'],
    ['A6', 'Категория', 'Список заполняется после загрузки данных'],
    ['A8', 'Автообновление', 'После изменения: меню «Отчёты» → «Применить расписание»'],
    ['A9', 'Час обновления (0–23)', 'По часовому поясу таблицы'],
    ['A11', 'Последнее обновление', ''],
    ['A12', 'Загружено записей', ''],
  ];
  labels.forEach(function (l) {
    sh.getRange(l[0]).setValue(l[1]).setFontWeight('bold');
    sh.getRange(l[0]).offset(0, 3).setValue(l[2]).setFontColor(COLORS.muted).setFontStyle('italic');
  });

  // Значения по умолчанию — только если ячейка пустая.
  setIfEmpty(sh.getRange(CELLS.apiUrl), DEFAULT_API_URL);
  setIfEmpty(sh.getRange(CELLS.category), ALL_CATEGORIES);
  setIfEmpty(sh.getRange(CELLS.autoUpdate), 'Нет');
  setIfEmpty(sh.getRange(CELLS.updateHour), 8);

  const inputs = [CELLS.apiUrl, CELLS.dateFrom, CELLS.dateTo, CELLS.category, CELLS.autoUpdate, CELLS.updateHour];
  inputs.forEach(function (a) {
    sh.getRange(a).setBackground(COLORS.input).setBorder(true, true, true, true, false, false, '#E0C46C', SpreadsheetApp.BorderStyle.SOLID);
  });

  const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
    .setHelpText('Выберите дату или оставьте пустым').build();
  sh.getRange(CELLS.dateFrom).setDataValidation(dateRule).setNumberFormat(FMT.date);
  sh.getRange(CELLS.dateTo).setDataValidation(dateRule).setNumberFormat(FMT.date);
  sh.getRange(CELLS.autoUpdate).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Да', 'Нет'], true).build());
  sh.getRange(CELLS.updateHour).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, 23).setAllowInvalid(false).build());
  sh.getRange(CELLS.lastUpdate).setNumberFormat('dd.mm.yyyy hh:mm');

  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 380);
  sh.setColumnWidth(3, 20);
  sh.setColumnWidth(4, 420);
  sh.setHiddenGridlines(true);
}

function setupDataSheet(sh) {
  const header = DATA_COLUMNS.map(function (c) { return c.title; });
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  styleHeader(sh.getRange(1, 1, 1, header.length));
  sh.setFrozenRows(1);
  DATA_COLUMNS.forEach(function (c, i) { sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat(c.format); });
  sh.setColumnWidth(3, 260);
}

function setupReportControls(sh) {
  sh.getRange('A1').setValue('Отчёт по товарам').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Сортировать по:').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('C2').setValue('Порядок:').setFontWeight('bold').setHorizontalAlignment('right');

  const sortCell = sh.getRange(REPORT_CONTROLS.sortBy);
  const orderCell = sh.getRange(REPORT_CONTROLS.order);
  sortCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(SORT_OPTIONS.map(function (o) { return o.title; }), true).build());
  orderCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([SORT_DESC, SORT_ASC], true).build());
  setIfEmpty(sortCell, SORT_OPTIONS[0].title);
  setIfEmpty(orderCell, SORT_DESC);
  [sortCell, orderCell].forEach(function (r) { r.setBackground(COLORS.input); });
  sh.setHiddenGridlines(true);
}

function setupLogSheet(sh) {
  const header = ['Время', 'Действие', 'Результат', 'Записей', 'Секунд', 'Подробности'];
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  styleHeader(sh.getRange(1, 1, 1, header.length));
  sh.setFrozenRows(1);
  sh.getRange('A2:A').setNumberFormat('dd.mm.yyyy hh:mm:ss');
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 220);
  sh.setColumnWidth(6, 500);
}

// ---------- Данные ----------

/** Перезаписывает лист «Данные» записями из API. */
function writeData(records) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.data);
  const width = DATA_COLUMNS.length;
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, width).clearContent();
  if (!records.length) return;

  const rows = records.map(function (r) {
    return DATA_COLUMNS.map(function (c) { return r[c.key]; });
  });
  if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
  sh.getRange(2, 1, rows.length, width).setValues(rows);
  DATA_COLUMNS.forEach(function (c, i) { sh.getRange(2, i + 1, rows.length, 1).setNumberFormat(c.format); });

  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, rows.length + 1, width).createFilter();
}

/** Читает лист «Данные» обратно в объекты; даты — строки ГГГГ-ММ-ДД. */
function readRecords() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEETS.data);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const values = sh.getRange(2, 1, last - 1, DATA_COLUMNS.length).getValues();
  return values.map(function (row) {
    const r = {};
    DATA_COLUMNS.forEach(function (c, i) { r[c.key] = row[i]; });
    r.date = toIsoDate(r.date, tz);
    return r;
  });
}

function toIsoDate(value, tz) {
  if (value instanceof Date) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  const s = String(value || '').trim();
  const ru = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return ru ? ru[3] + '-' + ru[2] + '-' + ru[1] : s;
}

/** Обновляет выпадающий список категорий в настройках. */
function updateCategoryList(records) {
  const categories = Array.from(new Set(records.map(function (r) { return r.category; }))).sort();
  const cell = SpreadsheetApp.getActive().getSheetByName(SHEETS.settings).getRange(CELLS.category);
  cell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([ALL_CATEGORIES].concat(categories), true).build());
  if (cell.getValue() && cell.getValue() !== ALL_CATEGORIES && categories.indexOf(cell.getValue()) < 0) {
    cell.setValue(ALL_CATEGORIES);
  }
}

// ---------- Настройки ----------

function readSettings() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEETS.settings);
  const tz = ss.getSpreadsheetTimeZone();
  const dateFrom = sh.getRange(CELLS.dateFrom).getValue();
  const dateTo = sh.getRange(CELLS.dateTo).getValue();
  return {
    apiUrl: sh.getRange(CELLS.apiUrl).getValue(),
    dateFrom: dateFrom ? toIsoDate(dateFrom, tz) : '',
    dateTo: dateTo ? toIsoDate(dateTo, tz) : '',
    category: sh.getRange(CELLS.category).getValue() || ALL_CATEGORIES,
    autoUpdate: sh.getRange(CELLS.autoUpdate).getValue() === 'Да',
    updateHour: Number(sh.getRange(CELLS.updateHour).getValue()) || 0,
  };
}

/** «Период: 01.10.2026 — 06.11.2026 · Категория: Все» по фактическим датам отобранных записей. */
function periodCaption(records, settings) {
  const dates = records.map(function (r) { return r.date; }).sort();
  const ru = function (iso) { return iso ? iso.split('-').reverse().join('.') : '—'; };
  const from = settings.dateFrom || dates[0];
  const to = settings.dateTo || dates[dates.length - 1];
  return 'Период: ' + ru(from) + ' — ' + ru(to) + '   ·   Категория: ' + settings.category;
}

// ---------- Воронка ----------

function renderFunnel(records, settings) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.funnel);
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();
  sh.setHiddenGridlines(true);

  sh.getRange('A1').setValue('Воронка продаж').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue(periodCaption(records, settings)).setFontColor(COLORS.muted);

  if (!records.length) {
    sh.getRange('A4').setValue('Нет данных за выбранный период. Загрузите данные: меню «Отчёты» → «Обновить данные из API».');
    return;
  }

  const totals = sumTotals(records);
  const k = kpis(totals);

  // Блок ключевых показателей.
  const kpiTitles = ['Выручка', 'Заказы', 'Выкупы', 'Средний чек', 'Процент выкупа', 'Из карточки в заказ'];
  const kpiValues = [k.revenue, k.orders, k.buyouts, k.avgCheck, k.buyoutRate, k.overallRate];
  const kpiFormats = [FMT.money, FMT.int, FMT.int, FMT.money, FMT.percent, FMT.percent];
  sh.getRange(4, 1, 1, 6).setValues([kpiTitles]).setFontColor(COLORS.muted).setFontSize(9);
  sh.getRange(5, 1, 1, 6).setValues([kpiValues]).setFontSize(18).setFontWeight('bold')
    .setNumberFormats([kpiFormats]).setHorizontalAlignment('left');

  // Таблица воронки.
  const top = 7;
  const rows = funnelRows(totals);
  sh.getRange(top, 1, 1, 4).setValues([['Этап', 'Количество', 'Из предыдущего', 'От показов']]);
  styleHeader(sh.getRange(top, 1, 1, 4));
  sh.getRange(top + 1, 1, rows.length, 4).setValues(rows);
  sh.getRange(top + 1, 2, rows.length, 1).setNumberFormat(FMT.int);
  sh.getRange(top + 1, 3, rows.length, 2).setNumberFormat(FMT.percent);
  bandRows(sh.getRange(top + 1, 1, rows.length, 4));

  sh.insertChart(sh.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sh.getRange(top, 1, rows.length + 1, 2))
    .setPosition(top, 6, 10, 0)
    .setOption('title', 'Воронка (логарифмическая шкала)')
    .setOption('legend', { position: 'none' })
    .setOption('hAxis', { logScale: true, format: 'short' })
    .setOption('colors', [COLORS.accent])
    .setOption('width', 560)
    .setOption('height', 300)
    .build());

  // Воронка по категориям.
  const catTop = 24;
  const catHeader = ['Категория', 'Показы', 'Карточка', 'Корзина', 'Заказы', 'Выкупы', 'Выручка', 'CTR', 'В заказ', 'Выкуп'];
  const cats = sortRows(aggregateBy(records, 'category'), 'revenue', true);
  sh.getRange(catTop - 1, 1).setValue('По категориям').setFontWeight('bold');
  sh.getRange(catTop, 1, 1, catHeader.length).setValues([catHeader]);
  styleHeader(sh.getRange(catTop, 1, 1, catHeader.length));
  const catRows = cats.map(function (c) {
    return [c.category, c.impressions, c.card_views, c.add_to_cart, c.orders, c.buyouts, c.revenue,
      c.ctr, c.orderRate, c.buyoutRate];
  });
  sh.getRange(catTop + 1, 1, catRows.length, catHeader.length).setValues(catRows);
  sh.getRange(catTop + 1, 2, catRows.length, 5).setNumberFormat(FMT.int);
  sh.getRange(catTop + 1, 7, catRows.length, 1).setNumberFormat(FMT.money);
  sh.getRange(catTop + 1, 8, catRows.length, 3).setNumberFormat(FMT.percent);
  bandRows(sh.getRange(catTop + 1, 1, catRows.length, catHeader.length));

  // Динамика по дням: вспомогательная таблица справа + график под категориями.
  const daily = dailyRows(records);
  const dCol = 13;
  sh.getRange(1, dCol, 1, 3).setValues([['Дата', 'Заказы', 'Выручка']]).setFontColor(COLORS.muted);
  sh.getRange(2, dCol, daily.length, 3).setValues(daily).setFontColor(COLORS.muted);
  sh.getRange(2, dCol, daily.length, 1).setNumberFormat(FMT.date);
  sh.getRange(2, dCol + 1, daily.length, 2).setNumberFormat(FMT.int);

  sh.insertChart(sh.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sh.getRange(1, dCol, daily.length + 1, 1))
    .addRange(sh.getRange(1, dCol + 2, daily.length + 1, 1))
    .setPosition(catTop + catRows.length + 3, 1, 0, 0)
    .setOption('title', 'Выручка по дням, ₽')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COLORS.accent])
    .setOption('width', 900)
    .setOption('height', 280)
    .build());

  sh.setColumnWidth(1, 190);
  for (let c = 2; c <= 10; c++) sh.setColumnWidth(c, 110);
}

// ---------- Отчёт ----------

const REPORT_HEADER = ['Артикул', 'Товар', 'Категория', 'Показы', 'Карточка', 'Корзина', 'Заказы', 'Выкупы',
  'Выручка', 'CTR', 'В корзину', 'В заказ', 'Выкуп'];

function renderReport(records, settings) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.report);
  const first = REPORT_CONTROLS.firstRow;
  const width = REPORT_HEADER.length;

  // Очищаем только таблицу: ячейки сортировки сохраняют выбор пользователя.
  if (sh.getMaxRows() >= first - 1) {
    sh.getRange(first - 1, 1, sh.getMaxRows() - first + 2, width).clear();
  }
  sh.setConditionalFormatRules([]);
  sh.getRange('F2').setValue(periodCaption(records, settings)).setFontColor(COLORS.muted);

  sh.getRange(first - 1, 1, 1, width).setValues([REPORT_HEADER]);
  styleHeader(sh.getRange(first - 1, 1, 1, width));
  sh.setFrozenRows(first - 1);

  if (!records.length) {
    sh.getRange(first, 1).setValue('Нет данных за выбранный период.');
    return;
  }

  const field = sortFieldByTitle(sh.getRange(REPORT_CONTROLS.sortBy).getValue());
  const desc = sh.getRange(REPORT_CONTROLS.order).getValue() !== SORT_ASC;
  const products = sortRows(aggregateBy(records, 'sku'), field, desc);

  const rows = products.map(function (p) {
    return [p.sku, p.name, p.category, p.impressions, p.card_views, p.add_to_cart, p.orders, p.buyouts,
      p.revenue, p.ctr, p.cartRate, p.orderRate, p.buyoutRate];
  });
  const totals = withRates(sumTotals(records));
  rows.push(['Итого', '', '', totals.impressions, totals.card_views, totals.add_to_cart, totals.orders,
    totals.buyouts, totals.revenue, totals.ctr, totals.cartRate, totals.orderRate, totals.buyoutRate]);

  const body = sh.getRange(first, 1, rows.length, width);
  body.setValues(rows);
  sh.getRange(first, 4, rows.length, 5).setNumberFormat(FMT.int);
  sh.getRange(first, 9, rows.length, 1).setNumberFormat(FMT.money);
  sh.getRange(first, 10, rows.length, 4).setNumberFormat(FMT.percent);
  bandRows(sh.getRange(first, 1, rows.length - 1, width));
  sh.getRange(first + rows.length - 1, 1, 1, width).setFontWeight('bold')
    .setBorder(true, null, null, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Цветовая шкала по конверсии в заказ и выкупу (без строки «Итого»).
  const scale = function (col) {
    return SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpoint('#F8D7DA').setGradientMidpointWithValue('#FFFFFF', SpreadsheetApp.InterpolationType.PERCENTILE, '50')
      .setGradientMaxpoint('#CDEBD7')
      .setRanges([sh.getRange(first, col, rows.length - 1, 1)])
      .build();
  };
  sh.setConditionalFormatRules([scale(12), scale(13)]);

  sh.setColumnWidth(1, 90);
  sh.setColumnWidth(2, 250);
  sh.setColumnWidth(3, 110);
  for (let c = 4; c <= width; c++) sh.setColumnWidth(c, 95);
}

// ---------- Журнал ----------

const LOG_MAX_ROWS = 500;

function writeLog(action, result, records, seconds, details) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.log);
  if (!sh) return;
  sh.insertRowAfter(1);
  sh.getRange(2, 1, 1, 6).setValues([[new Date(), action, result, records, seconds, details || '']]);
  sh.getRange(2, 3).setFontColor(result === 'Успех' ? COLORS.accent : '#C0392B');
  if (sh.getLastRow() > LOG_MAX_ROWS + 1) sh.deleteRows(LOG_MAX_ROWS + 2, sh.getLastRow() - LOG_MAX_ROWS - 1);
}

// ---------- Оформление ----------

function styleHeader(range) {
  range.setBackground(COLORS.header).setFontColor(COLORS.headerText).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);
}

function bandRows(range) {
  const rows = range.getNumRows();
  const backgrounds = [];
  for (let i = 0; i < rows; i++) {
    const color = i % 2 ? COLORS.band : '#FFFFFF';
    backgrounds.push(new Array(range.getNumColumns()).fill(color));
  }
  range.setBackgrounds(backgrounds);
}

function setIfEmpty(range, value) {
  if (range.getValue() === '') range.setValue(value);
}
