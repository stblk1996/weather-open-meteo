const form = document.getElementById('weather-form');
const cityInput = document.getElementById('city');
const dateInput = document.getElementById('weather-date');
const result = document.getElementById('result');
const submitButton = form.querySelector('button');

function getWeatherVisual(code, isDay) {
  const day = isDay !== 0;

  if (code === 0) {
    return {
      icon: day ? '☀️' : '🌙',
      label: day ? 'Ясно' : 'Ясная ночь',
    };
  }

  if ([1, 2].includes(code)) {
    return {
      icon: day ? '🌤️' : '☁️',
      label: 'Небольшая облачность',
    };
  }

  if (code === 3) {
    return {
      icon: '☁️',
      label: 'Пасмурно',
    };
  }

  if ([45, 48].includes(code)) {
    return {
      icon: '🌫️',
      label: 'Туман',
    };
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return {
      icon: '🌦️',
      label: 'Морось',
    };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return {
      icon: '🌧️',
      label: 'Дождь',
    };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return {
      icon: '❄️',
      label: 'Снег',
    };
  }

  if ([95, 96, 99].includes(code)) {
    return {
      icon: '⛈️',
      label: 'Гроза',
    };
  }

  return {
    icon: '🌡️',
    label: 'Погода',
  };
}

function formatResult(data) {
  const visual = getWeatherVisual(Number(data.weatherCode), 1);
  const advice = getPurposeAdvice(data);

  return `
    <article class="weather-box">
      <div class="weather-icon" aria-hidden="true">${visual.icon}</div>
      <div class="weather-info">
        <p class="weather-city">${data.city}</p>
        <p class="weather-date">${data.date}</p>
        <p class="weather-meta">${visual.label}</p>
        <p class="weather-temp">от ${data.tempMin}°C до ${data.tempMax}°C</p>
        <p class="weather-feels">Ощущается как от ${data.feelsLikeMin}°C до ${data.feelsLikeMax}°C</p>
        <p class="weather-advice">${advice}</p>
      </div>
    </article>
  `;
}

function getPurposeAdvice(data) {
  const purpose = data.purpose;
  const weatherCode = Number(data.weatherCode);
  const maxTemp = Number(data.tempMax);
  const minTemp = Number(data.tempMin);
  const rainy = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode);
  const snowy = [71, 73, 75, 77, 85, 86].includes(weatherCode);
  const storm = [95, 96, 99].includes(weatherCode);

  if (purpose === 'walk') {
    if (storm) return 'Для прогулки день небезопасный: лучше перенести или сократить маршрут.';
    if (rainy || snowy) return 'Для прогулки пригодится непромокаемая обувь и верхняя одежда по погоде.';
    if (maxTemp >= 24) return 'Для прогулки будет тепло: возьмите воду и легкую одежду.';
    if (minTemp <= 3) return 'Для прогулки будет прохладно: лучше одеться теплее.';
    return 'Для прогулки условия в целом комфортные.';
  }

  if (purpose === 'vacation') {
    if (storm) return 'Для планирования отпуска учтите риск грозы в этот день.';
    if (rainy || snowy) return 'Для отпуска на эту дату стоит предусмотреть запасной план в помещении.';
    return 'Для отпуска погода выглядит благоприятной на выбранную дату.';
  }

  if (purpose === 'work') {
    if (storm || rainy || snowy) return 'Для дороги на работу заложите дополнительное время на путь.';
    if (minTemp <= 0) return 'Для дороги на работу одевайтесь теплее и учитывайте возможный гололед утром.';
    return 'Для дороги на работу погодные условия спокойные.';
  }

  return 'Погода на выбранную дату показана для справки.';
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
