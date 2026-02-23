# Простая страница с температурой из Open-Meteo

Если открыть `index.html` напрямую (двойным кликом), запрос погоды не сработает.
Нужно запускать через локальный сервер.

## Запуск (Python)
```bash
cd "/Users/balakin/Documents/New project"
python3 server.py
```

Откройте в браузере: `http://localhost:3000`

## Что делает проект
- `index.html` — форма с вводом города
- `app.js` — запрос `/api/weather?city=...`
- `server.py` — локальный сервер + запрос к Open-Meteo

## Важно
- Для координат города используется Nominatim (OpenStreetMap).
- Погода берется из API Open-Meteo (`/v1/forecast`).
- API-ключ не требуется.

## Публикация в интернете (Render)
1. Загрузите проект в GitHub-репозиторий.
2. Зайдите в Render и создайте `New +` -> `Web Service`.
3. Подключите репозиторий.
4. Выберите `Runtime: Docker` (Render сам использует `Dockerfile`).
5. Нажмите `Create Web Service`.
6. После деплоя откройте публичный URL вида `https://<service>.onrender.com`.

После этого сайт будет доступен всем в интернете.
