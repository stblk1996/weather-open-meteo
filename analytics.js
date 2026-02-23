function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNum(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

function renderTable(rows, columns, emptyText = 'Нет данных') {
  if (!rows || !rows.length) {
    return `<p class="empty">${emptyText}</p>`;
  }

  const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${esc(row[c.key] ?? '')}</td>`).join('')}</tr>`)
    .join('');

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

async function loadAnalytics() {
  const response = await fetch('/api/analytics');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Не удалось загрузить аналитику');
  }
  return data;
}

function renderKpis(data) {
  const cards = [
    { label: 'Всего пользователей', value: formatNum(data.retention.totalUsers) },
    { label: 'Возврат пользователей', value: `${data.retention.returningRate}%` },
    { label: 'D1 ретеншен', value: `${data.retention.d1RetentionRate}%` },
    { label: 'Переходов по ссылкам', value: formatNum(data.linkClicks.total) },
    { label: 'Ошибок', value: formatNum(data.errors.total) },
    { label: 'Средняя загрузка', value: `${formatNum(data.pageLoad.avgMs)} мс` },
  ];

  document.getElementById('kpis').innerHTML = cards
    .map((card) => `<article class="kpi"><p>${esc(card.label)}</p><strong>${esc(card.value)}</strong></article>`)
    .join('');
}

function renderAll(data) {
  renderKpis(data);

  document.getElementById('viewsByDay').innerHTML = renderTable(
    data.viewsByDay,
    [
      { key: 'day', label: 'Дата' },
      { key: 'count', label: 'Заходов' },
    ],
  );

  document.getElementById('datesClicked').innerHTML = renderTable(
    data.datesClicked,
    [
      { key: 'target_date', label: 'Дата прогноза' },
      { key: 'count', label: 'Кликов' },
    ],
  );

  document.getElementById('retention').innerHTML = `
    <div class="metrics">
      <p><b>Всего пользователей:</b> ${esc(formatNum(data.retention.totalUsers))}</p>
      <p><b>Вернувшихся пользователей:</b> ${esc(formatNum(data.retention.returningUsers))}</p>
      <p><b>Return rate:</b> ${esc(data.retention.returningRate)}%</p>
      <p><b>D1 retention:</b> ${esc(data.retention.d1RetentionRate)}%</p>
    </div>
  `;

  document.getElementById('linkClicks').innerHTML = renderTable(
    data.linkClicks.topLinks,
    [
      { key: 'link_url', label: 'Ссылка' },
      { key: 'count', label: 'Переходов' },
    ],
  );

  const errorsHtml = `
    <h3>По кодам</h3>
    ${renderTable(data.errors.byCode, [
      { key: 'code', label: 'Код' },
      { key: 'count', label: 'Количество' },
    ])}
    <h3>Последние ошибки</h3>
    ${renderTable(data.errors.recent, [
      { key: 'ts', label: 'Время (UTC)' },
      { key: 'message', label: 'Сообщение' },
    ])}
  `;
  document.getElementById('errors').innerHTML = errorsHtml;

  document.getElementById('pageLoad').innerHTML = `
    <div class="metrics">
      <p><b>Измерений:</b> ${esc(formatNum(data.pageLoad.samples))}</p>
      <p><b>Средняя загрузка:</b> ${esc(formatNum(data.pageLoad.avgMs))} мс</p>
      <p><b>P95:</b> ${esc(formatNum(data.pageLoad.p95Ms))} мс</p>
      <p><b>Максимум:</b> ${esc(formatNum(data.pageLoad.maxMs))} мс</p>
    </div>
  `;

  document.getElementById('enteredCities').innerHTML = renderTable(
    data.searchGeo.enteredCities,
    [
      { key: 'city', label: 'Город' },
      { key: 'count', label: 'Запросов' },
    ],
  );

  document.getElementById('countries').innerHTML = renderTable(
    data.searchGeo.countries,
    [
      { key: 'country', label: 'Страна' },
      { key: 'count', label: 'Запросов' },
    ],
  );
}

(async () => {
  const root = document.querySelector('.dashboard');
  try {
    const data = await loadAnalytics();
    renderAll(data);
  } catch (error) {
    root.innerHTML = `<p class="error">${esc(error.message)}</p>`;
  }
})();
