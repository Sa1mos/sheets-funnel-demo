/**
 * Точки входа: меню, обработчик правок, расписание.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Отчёты')
    .addItem('Обновить данные из API', 'menuUpdateData')
    .addItem('Пересчитать отчёты', 'menuRecalculate')
    .addSeparator()
    .addItem('Применить расписание автообновления', 'menuApplySchedule')
    .addItem('Первичная настройка', 'menuSetup')
    .addToUi();
}

/** Пересчёт при смене сортировки, периода или категории — без запроса к API. */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet().getName();
  const a1 = e.range.getA1Notation();
  try {
    if (sheet === SHEETS.report && (a1 === REPORT_CONTROLS.sortBy || a1 === REPORT_CONTROLS.order)) {
      const settings = readSettings();
      renderReport(filterRecords(readRecords(), settings.dateFrom, settings.dateTo, settings.category), settings);
    } else if (sheet === SHEETS.settings && [CELLS.dateFrom, CELLS.dateTo, CELLS.category].indexOf(a1) >= 0) {
      renderAll();
    }
  } catch (err) {
    writeLog('Пересчёт после правки', 'Ошибка', '', '', err.message);
  }
}

// ---------- Пункты меню ----------

function menuSetup() {
  setupSpreadsheet();
  SpreadsheetApp.getActive().toast('Листы созданы. Теперь: «Отчёты» → «Обновить данные из API».', 'Готово', 8);
}

function menuUpdateData() {
  try {
    const count = updateData('Обновление вручную');
    SpreadsheetApp.getActive().toast('Загружено записей: ' + count, 'Данные обновлены', 6);
  } catch (err) {
    SpreadsheetApp.getUi().alert('Не удалось обновить данные', err.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function menuRecalculate() {
  const started = Date.now();
  renderAll();
  writeLog('Пересчёт вручную', 'Успех', '', seconds(started), '');
  SpreadsheetApp.getActive().toast('Воронка и отчёт пересчитаны.', 'Готово', 4);
}

function menuApplySchedule() {
  const ui = SpreadsheetApp.getUi();
  const settings = readSettings();
  removeScheduleTriggers();

  if (!settings.autoUpdate) {
    writeLog('Расписание', 'Успех', '', '', 'Автообновление выключено');
    ui.alert('Автообновление выключено.');
    return;
  }
  const hour = Math.min(23, Math.max(0, Math.floor(settings.updateHour)));
  ScriptApp.newTrigger('scheduledUpdate').timeBased().everyDays(1).atHour(hour).create();
  writeLog('Расписание', 'Успех', '', '', 'Каждый день около ' + hour + ':00');
  ui.alert('Готово: данные будут обновляться каждый день около ' + hour + ':00.');
}

// ---------- Основные операции ----------

/** Запуск по расписанию: ошибки только в журнал, окон показывать некому. */
function scheduledUpdate() {
  try {
    updateData('Обновление по расписанию');
  } catch (err) {
    // Уже записано в журнал внутри updateData.
  }
}

/**
 * Загрузка из API → запись на лист «Данные» → пересчёт.
 * Блокировка не даёт двум запускам (ручному и по расписанию) писать одновременно.
 */
function updateData(action) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Другое обновление ещё выполняется, попробуйте через минуту.');
  }
  const started = Date.now();
  try {
    const settings = readSettings();
    const records = fetchAllRecords(settings.apiUrl);
    writeData(records);
    updateCategoryList(records);

    const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.settings);
    sh.getRange(CELLS.lastUpdate).setValue(new Date());
    sh.getRange(CELLS.recordsLoaded).setValue(records.length);

    renderAll();
    writeLog(action, 'Успех', records.length, seconds(started), '');
    return records.length;
  } catch (err) {
    writeLog(action, 'Ошибка', '', seconds(started), err.message);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** Пересчитывает воронку и отчёт по данным с листа. */
function renderAll() {
  const settings = readSettings();
  const records = filterRecords(readRecords(), settings.dateFrom, settings.dateTo, settings.category);
  renderFunnel(records, settings);
  renderReport(records, settings);
}

function removeScheduleTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledUpdate') ScriptApp.deleteTrigger(t);
  });
}

function seconds(started) {
  return Math.round((Date.now() - started) / 100) / 10;
}
