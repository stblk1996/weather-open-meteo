const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YANDEX_WEATHER_API_KEY;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

async function geocodeCity(city) {
  const geocoderUrl = new URL('https://nominatim.openstreetmap.org/search');
  geocoderUrl.searchParams.set('q', city);
  geocoderUrl.searchParams.set('format', 'json');
  geocoderUrl.searchParams.set('limit', '1');

  const response = await fetch(geocoderUrl, {
    headers: {
      'User-Agent': 'simple-yandex-weather-app/1.0',
      'Accept-Language': 'ru',
    },
  });

  if (!response.ok) {
    throw new Error('Ошибка геокодирования города');
  }

  const data = await response.json();
  if (!data.length) {
    throw new Error('Город не найден');
  }

  return {
    lat: data[0].lat,
    lon: data[0].lon,
    displayName: city,
  };
}

async function getYandexWeather(lat, lon) {
  if (!API_KEY) {
    throw new Error('Не задан YANDEX_WEATHER_API_KEY');
  }

  const weatherUrl = new URL('https://api.weather.yandex.ru/v2/informers');
  weatherUrl.searchParams.set('lat', lat);
  weatherUrl.searchParams.set('lon', lon);
  weatherUrl.searchParams.set('lang', 'ru_RU');

  const response = await fetch(weatherUrl, {
    headers: {
      'X-Yandex-Weather-Key': API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error('Яндекс Погода вернула ошибку');
  }

  const data = await response.json();
  return {
    temp: data?.fact?.temp,
    feelsLike: data?.fact?.feels_like,
  };
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && reqUrl.pathname === '/api/weather') {
    const city = reqUrl.searchParams.get('city')?.trim();

    if (!city) {
      sendJson(res, 400, { error: 'Укажите город в параметре city' });
      return;
    }

    try {
      const location = await geocodeCity(city);
      const weather = await getYandexWeather(location.lat, location.lon);

      sendJson(res, 200, {
        city: location.displayName,
        temp: weather.temp,
        feelsLike: weather.feelsLike,
      });
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Внутренняя ошибка сервера' });
    }

    return;
  }

  if (req.method === 'GET' && (reqUrl.pathname === '/' || reqUrl.pathname === '/index.html')) {
    serveStaticFile(res, path.join(ROOT, 'index.html'));
    return;
  }

  if (req.method === 'GET') {
    const filePath = path.join(ROOT, reqUrl.pathname.replace(/^\/+/, ''));
    serveStaticFile(res, filePath);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});
