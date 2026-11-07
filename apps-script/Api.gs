/**
 * Загрузка данных из API с постраничной выдачей.
 * Страницы: <базовый адрес>page-1.json, page-2.json, … до next_page = null.
 */

/**
 * Загружает все страницы и возвращает записи.
 * Бросает ошибку с понятным текстом, если API недоступен или ответ не той формы:
 * тогда старые данные в таблице остаются нетронутыми.
 */
function fetchAllRecords(baseUrl) {
  const url = normalizeBaseUrl(baseUrl);
  const records = [];
  let page = 1;
  let expectedTotal = null;

  while (page) {
    if (page > MAX_PAGES) {
      throw new Error('API вернул больше ' + MAX_PAGES + ' страниц — похоже на ошибку пагинации.');
    }
    const payload = fetchJsonWithRetry(url + 'page-' + page + '.json');
    validatePage(payload, page);

    expectedTotal = payload.total_items;
    payload.items.forEach(function (item) { records.push(item); });
    page = payload.next_page;
  }

  if (expectedTotal !== null && records.length !== expectedTotal) {
    throw new Error('Получено записей: ' + records.length + ', а API заявил ' + expectedTotal + '.');
  }
  return records;
}

function normalizeBaseUrl(baseUrl) {
  const url = String(baseUrl || '').trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Адрес API должен начинаться с https:// (лист «Настройки», ячейка ' + CELLS.apiUrl + ').');
  }
  return url.endsWith('/') ? url : url + '/';
}

/** GET-запрос с повторами при сетевых сбоях и ответах 429/5xx. */
function fetchJsonWithRetry(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    let response;
    try {
      response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { Accept: 'application/json' },
      });
    } catch (e) {
      // Сетевой сбой (таймаут, DNS) — имеет смысл повторить.
      lastError = new Error('Сетевая ошибка: ' + e.message);
    }

    if (response) {
      const code = response.getResponseCode();
      if (code === 200) {
        try {
          return JSON.parse(response.getContentText('UTF-8'));
        } catch (e) {
          throw new Error('Ответ API — не JSON: ' + url);
        }
      }
      // 429 и 5xx — временные, повторяем; остальные 4xx повтор не исправит.
      if (code !== 429 && code < 500) {
        throw new Error(code === 404
          ? 'Страница не найдена (404): ' + url
          : 'API ответил ошибкой HTTP ' + code + ': ' + url);
      }
      lastError = new Error('API временно недоступен (HTTP ' + code + ').');
    }

    // Пауза перед повтором: 1 с, 2 с.
    if (attempt < FETCH_RETRIES) Utilities.sleep(1000 * Math.pow(2, attempt - 1));
  }
  throw new Error('Не удалось получить данные после ' + FETCH_RETRIES + ' попыток. ' + lastError.message);
}

/** Проверка формы страницы, чтобы не записать в таблицу мусор. */
function validatePage(payload, page) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Страница ' + page + ': пустой ответ.');
  }
  if (!Array.isArray(payload.items)) {
    throw new Error('Страница ' + page + ': нет массива items.');
  }
  if (payload.page !== page) {
    throw new Error('Запрошена страница ' + page + ', а пришла ' + payload.page + '.');
  }
  if (payload.next_page !== null && payload.next_page !== page + 1) {
    throw new Error('Страница ' + page + ': неверный next_page (' + payload.next_page + ').');
  }
  const required = DATA_COLUMNS.map(function (c) { return c.key; });
  payload.items.forEach(function (item, i) {
    required.forEach(function (key) {
      if (item[key] === undefined || item[key] === null) {
        throw new Error('Страница ' + page + ', запись ' + (i + 1) + ': нет поля «' + key + '».');
      }
    });
  });
}
