const form = document.getElementById('weather-form');
const cityInput = document.getElementById('city');
const result = document.getElementById('result');
const submitButton = form.querySelector('button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const city = cityInput.value.trim();
  if (!city) return;

  submitButton.disabled = true;
  result.className = 'result';
  result.textContent = 'Загружаю данные...';

  try {
    const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Не удалось получить погоду');
    }

    result.textContent = `Сейчас в городе ${data.city}: ${data.temp}°C, ощущается как ${data.feelsLike}°C.`;
  } catch (error) {
    result.className = 'result error';
    result.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});
