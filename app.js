const form = document.getElementById('weather-form');
const cityInput = document.getElementById('city');
const dateInput = document.getElementById('weather-date');
const result = document.getElementById('result');
const submitButton = form.querySelector('button');

const INTERNET_LINKS = {
  umbrella: 'https://www.ozon.ru/search/?text=%D0%B7%D0%BE%D0%BD%D1%82',
  raincoat: 'https://www.ozon.ru/search/?text=%D0%B4%D0%BE%D0%B6%D0%B4%D0%B5%D0%B2%D0%B8%D0%BA',
  waterproofShoes: 'https://www.ozon.ru/search/?text=%D0%B2%D0%BE%D0%B4%D0%BE%D0%BD%D0%B5%D0%BF%D1%80%D0%BE%D0%BD%D0%B8%D1%86%D0%B0%D0%B5%D0%BC%D0%B0%D1%8F+%D0%BE%D0%B1%D1%83%D0%B2%D1%8C',
  thermalWear: 'https://www.ozon.ru/search/?text=%D1%82%D0%B5%D1%80%D0%BC%D0%BE%D0%B1%D0%B5%D0%BB%D1%8C%D0%B5',
  sunglasses: 'https://www.ozon.ru/search/?text=%D1%81%D0%BE%D0%BB%D0%BD%D1%86%D0%B5%D0%B7%D0%B0%D1%89%D0%B8%D1%82%D0%BD%D1%8B%D0%B5+%D0%BE%D1%87%D0%BA%D0%B8',
  sunscreen: 'https://www.ozon.ru/search/?text=spf+50',
  fashionTrends: 'https://www.vogue.com/fashion/trends',
  cityTrends: 'https://www.vogue.com/article/backless-loafers',
  routes: 'https://yandex.ru/maps/',
  traffic: 'https://yandex.ru/maps/moscow/probki',
  publicTransport: 'https://yandex.ru/maps/moscow/transport',
  migraines: 'https://www.mayoclinic.org/diseases-conditions/migraine-headache/expert-answers/migraine-headache/faq-20058505',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getWeatherVisual(code, isDay) {
  const day = isDay !== 0;

  if (code === 0) return { icon: day ? '☀️' : '🌙', label: day ? 'Ясно' : 'Ясная ночь' };
  if ([1, 2].includes(code)) return { icon: day ? '🌤️' : '☁️', label: 'Небольшая облачность' };
  if (code === 3) return { icon: '☁️', label: 'Пасмурно' };
  if ([45, 48].includes(code)) return { icon: '🌫️', label: 'Туман' };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', label: 'Морось' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: '🌧️', label: 'Дождь' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '❄️', label: 'Снег' };
  if ([95, 96, 99].includes(code)) return { icon: '⛈️', label: 'Гроза' };

  return { icon: '🌡️', label: 'Погода' };
}

function getWeatherBucket(code) {
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([1, 2, 3].includes(code)) return 'cloudy';
  return 'clear';
}

function buildAd(bucket) {
  if (bucket === 'rain' || bucket === 'drizzle') {
    return {
      title: 'Реклама по погоде',
      text: 'Ожидаются осадки. Проверьте подборку зонтов и дождевиков онлайн.',
      linkText: 'Смотреть зонты и дождевики',
      href: INTERNET_LINKS.umbrella,
    };
  }

  if (bucket === 'snow') {
    return {
      title: 'Реклама по погоде',
      text: 'Снег и холод: может пригодиться термобелье и утепленная обувь.',
      linkText: 'Подобрать термобелье',
      href: INTERNET_LINKS.thermalWear,
    };
  }

  if (bucket === 'storm') {
    return {
      title: 'Реклама по погоде',
      text: 'Грозовая погода: лучше выбрать водозащиту для одежды и обуви.',
      linkText: 'Посмотреть дождевики',
      href: INTERNET_LINKS.raincoat,
    };
  }

  return {
    title: 'Реклама по погоде',
    text: 'Ясная или облачная погода: можно подобрать солнцезащитные аксессуары.',
    linkText: 'Смотреть солнцезащитные очки',
    href: INTERNET_LINKS.sunglasses,
  };
}

function getPurposeLabel(purpose) {
  const labels = {
    walk: 'Для прогулки',
    vacation: 'Планирую отпуск',
    work: 'Добраться до работы',
    interest: 'Ради интереса',
  };
  return labels[purpose] || 'Ради интереса';
}

function buildRecommendations(purpose, bucket, tempMin, tempMax) {
  const cold = tempMax <= 5;
  const hot = tempMax >= 26;

  const take = [];
  const wear = [];
  const transport = [];
  const meteo = [];

  if (bucket === 'rain' || bucket === 'drizzle') {
    take.push('Зонт или дождевик.');
    take.push('Непромокаемую обувь или запасные носки.');
  } else if (bucket === 'snow') {
    take.push('Перчатки и шарф.');
    take.push('Термокружку или теплый напиток.');
  } else if (bucket === 'storm') {
    take.push('Легкую водозащитную куртку.');
    take.push('Пауэрбанк на случай задержек в пути.');
  } else {
    take.push('Бутылку воды и легкий перекус.');
    if (hot) take.push('SPF и головной убор.');
  }

  if (purpose === 'walk') {
    wear.push('Для прогулки: многослойный комплект и удобные кроссовки.');
  } else if (purpose === 'vacation') {
    wear.push('Для отпуска: капсульный набор вещей, чтобы быстро менять образы.');
  } else if (purpose === 'work') {
    wear.push('Для дороги и офиса: непромокаемый верх + базовый smart casual.');
  } else {
    wear.push('Для повседневного выхода: комфортный городской casual-образ.');
  }

  if (cold) wear.push('По температуре: добавьте теплый слой и закрытую обувь.');
  if (hot) wear.push('По температуре: выбирайте дышащие ткани и светлые тона.');

  wear.push('Актуальные тренды смотрите в модных подборках по сезонам.');

  if (purpose === 'work') {
    if (bucket === 'rain' || bucket === 'snow' || bucket === 'storm') {
      transport.push('Лучше выехать раньше и проверить пробки/маршрут онлайн.');
    } else {
      transport.push('Можно выбрать общественный транспорт или велосипед по ситуации.');
    }
  } else if (purpose === 'vacation') {
    transport.push('Для поездок по городу заранее проверьте туристические маршруты и транспорт.');
  } else if (purpose === 'walk') {
    transport.push('Если осадки, лучше выбрать короткие маршруты с точками укрытия.');
  } else {
    transport.push('Для справки можно сравнить время в пути в картах перед выходом.');
  }

  if (bucket === 'storm') {
    meteo.push('Метеозависимым лучше снизить нагрузку и избегать длительного пребывания на улице.');
  } else if (bucket === 'snow' || bucket === 'rain') {
    meteo.push('При перепадах давления и влажности держите под рукой назначенные лекарства.');
  } else {
    meteo.push('Следите за режимом сна, воды и питания: это снижает риск погодных триггеров.');
  }

  return {
    take,
    wear,
    transport,
    meteo,
    links: {
      gear: [
        { text: 'Зонты', href: INTERNET_LINKS.umbrella },
        { text: 'Дождевики', href: INTERNET_LINKS.raincoat },
        { text: 'Термобелье', href: INTERNET_LINKS.thermalWear },
      ],
      fashion: [
        { text: 'Тренды Vogue', href: INTERNET_LINKS.fashionTrends },
        { text: 'Street-style примеры', href: INTERNET_LINKS.cityTrends },
      ],
      transport: [
        { text: 'Маршруты в Яндекс Картах', href: INTERNET_LINKS.routes },
        { text: 'Пробки', href: INTERNET_LINKS.traffic },
        { text: 'Общественный транспорт', href: INTERNET_LINKS.publicTransport },
      ],
      health: [
        { text: 'Погодные триггеры мигрени (Mayo Clinic)', href: INTERNET_LINKS.migraines },
      ],
    },
  };
}

function renderLinks(links) {
  return links
    .map(
      (link) =>
        `<a class="rec-link" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.text)}</a>`,
    )
    .join('');
}

function renderList(items) {
  return `<ul class="rec-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function formatResult(data) {
  const code = Number(data.weatherCode);
  const visual = getWeatherVisual(code, 1);
  const bucket = getWeatherBucket(code);
  const purpose = data.purpose;
  const recs = buildRecommendations(purpose, bucket, Number(data.tempMin), Number(data.tempMax));
  const ad = buildAd(bucket);

  return `
    <article class="weather-box">
      <div class="weather-icon" aria-hidden="true">${visual.icon}</div>
      <div class="weather-info">
        <p class="weather-city">${escapeHtml(data.city)}</p>
        <p class="weather-date">${escapeHtml(data.date)} · ${escapeHtml(getPurposeLabel(purpose))}</p>
        <p class="weather-meta">${visual.label}</p>
        <p class="weather-temp">от ${escapeHtml(data.tempMin)}°C до ${escapeHtml(data.tempMax)}°C</p>
        <p class="weather-feels">Ощущается как от ${escapeHtml(data.feelsLikeMin)}°C до ${escapeHtml(data.feelsLikeMax)}°C</p>

        <section class="rec-block">
          <h3>1) Что взять с собой</h3>
          ${renderList(recs.take)}
          <div class="rec-links">${renderLinks(recs.links.gear)}</div>
        </section>

        <section class="rec-block">
          <h3>2) Что надеть: тренд + комфорт</h3>
          ${renderList(recs.wear)}
          <div class="rec-links">${renderLinks(recs.links.fashion)}</div>
        </section>

        <section class="rec-block">
          <h3>3) Какой транспорт выбрать</h3>
          ${renderList(recs.transport)}
          <div class="rec-links">${renderLinks(recs.links.transport)}</div>
        </section>

        <section class="rec-block">
          <h3>4) На что обратить внимание метеозависимым</h3>
          ${renderList(recs.meteo)}
          <div class="rec-links">${renderLinks(recs.links.health)}</div>
        </section>

        <section class="ad-box">
          <h3>${escapeHtml(ad.title)}</h3>
          <p>${escapeHtml(ad.text)}</p>
          <a class="ad-link" href="${escapeHtml(ad.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ad.linkText)}</a>
        </section>
      </div>
    </article>
  `;
}

function setupDateInput() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const maxDate = new Date(now);
  maxDate.setDate(now.getDate() + 15);
  const max = maxDate.toISOString().slice(0, 10);

  dateInput.min = today;
  dateInput.max = max;
  dateInput.value = today;
}

setupDateInput();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const city = cityInput.value.trim();
  const selectedDate = dateInput.value;
  if (!city || !selectedDate) return;

  submitButton.disabled = true;
  result.className = 'result';
  result.textContent = 'Загружаю данные...';

  try {
    const response = await fetch(
      `/api/weather?city=${encodeURIComponent(city)}&date=${encodeURIComponent(selectedDate)}`,
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Не удалось получить погоду');
    }

    data.purpose = form.elements.purpose.value;
    result.innerHTML = formatResult(data);
  } catch (error) {
    result.className = 'result error';
    result.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});
