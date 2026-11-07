/**
 * Настройки проекта: имена листов, адреса ячеек, этапы воронки.
 * Всё, что может понадобиться поменять, собрано здесь.
 */

const SHEETS = {
  settings: 'Настройки',
  data: 'Данные',
  funnel: 'Воронка',
  report: 'Отчёт',
  log: 'Журнал',
};

/** Ячейки листа «Настройки». */
const CELLS = {
  apiUrl: 'B3',
  dateFrom: 'B4',
  dateTo: 'B5',
  category: 'B6',
  autoUpdate: 'B8',
  updateHour: 'B9',
  lastUpdate: 'B11',
  recordsLoaded: 'B12',
};

/** Ячейки управления на листе «Отчёт». */
const REPORT_CONTROLS = {
  sortBy: 'B2',
  order: 'D2',
  firstRow: 5,
};

/** Адрес мок-API по умолчанию (замените Sa1mos на свой логин, если форкнете репозиторий). */
const DEFAULT_API_URL =
  'https://raw.githubusercontent.com/Sa1mos/sheets-funnel-demo/main/api/v1/sales-funnel/';

/** Повторы запроса при сбоях сети и ответах 429/5xx. */
const FETCH_RETRIES = 3;

/** Защита от бесконечной пагинации, если API вернёт неверный next_page. */
const MAX_PAGES = 100;

const ALL_CATEGORIES = 'Все';

/** Столбцы листа «Данные»: ключ из API → заголовок → формат. */
const DATA_COLUMNS = [
  { key: 'date', title: 'Дата', format: 'dd.mm.yyyy' },
  { key: 'sku', title: 'Артикул', format: '@' },
  { key: 'name', title: 'Товар', format: '@' },
  { key: 'category', title: 'Категория', format: '@' },
  { key: 'price', title: 'Цена, ₽', format: '#,##0' },
  { key: 'impressions', title: 'Показы', format: '#,##0' },
  { key: 'card_views', title: 'Переходы в карточку', format: '#,##0' },
  { key: 'add_to_cart', title: 'В корзину', format: '#,##0' },
  { key: 'orders', title: 'Заказы', format: '#,##0' },
  { key: 'buyouts', title: 'Выкупы', format: '#,##0' },
  { key: 'revenue', title: 'Выручка, ₽', format: '#,##0' },
];

/** Варианты сортировки отчёта: подпись в выпадающем списке → поле строки. */
const SORT_OPTIONS = [
  { title: 'Выручка', field: 'revenue' },
  { title: 'Заказы', field: 'orders' },
  { title: 'Выкупы', field: 'buyouts' },
  { title: 'Показы', field: 'impressions' },
  { title: 'CTR', field: 'ctr' },
  { title: 'Конверсия в корзину', field: 'cartRate' },
  { title: 'Конверсия в заказ', field: 'orderRate' },
  { title: 'Процент выкупа', field: 'buyoutRate' },
  { title: 'Товар', field: 'name' },
];

const SORT_DESC = 'По убыванию';
const SORT_ASC = 'По возрастанию';

/** Цвета оформления. */
const COLORS = {
  header: '#1F3A2A',
  headerText: '#FFFFFF',
  accent: '#2EA05A',
  muted: '#6B7280',
  band: '#F3F7F4',
  input: '#FFF8E1',
};
