import json
import os
from datetime import date, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen

PORT = int(os.getenv("PORT", "10000"))
HOST = os.getenv("HOST", "0.0.0.0")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class WeatherHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/weather":
            self.handle_weather(parsed.query)
            return

        if parsed.path == "/":
            self.path = "/index.html"

        return super().do_GET()

    def handle_weather(self, query: str):
        params = parse_qs(query)
        city = (params.get("city", [""])[0] or "").strip()
        requested_date = (params.get("date", [""])[0] or "").strip()

        if not city:
            self.send_json(400, {"error": "Укажите город в параметре city"})
            return
        if not requested_date:
            self.send_json(400, {"error": "Укажите дату в параметре date"})
            return

        try:
            selected_date = date.fromisoformat(requested_date)
        except ValueError:
            self.send_json(400, {"error": "Неверный формат даты. Используйте YYYY-MM-DD"})
            return

        today = date.today()
        max_supported_date = today + timedelta(days=15)
        if selected_date < today or selected_date > max_supported_date:
            self.send_json(
                400,
                {
                    "error": (
                        f"Можно выбрать дату только с {today.isoformat()} "
                        f"по {max_supported_date.isoformat()}"
                    )
                },
            )
            return

        try:
            lat, lon = self.geocode_city(city)
            weather = self.fetch_weather(lat, lon, requested_date)
            self.send_json(
                200,
                {
                    "city": city,
                    "date": requested_date,
                    "tempMin": weather.get("temperature_2m_min"),
                    "tempMax": weather.get("temperature_2m_max"),
                    "feelsLikeMin": weather.get("apparent_temperature_min"),
                    "feelsLikeMax": weather.get("apparent_temperature_max"),
                    "weatherCode": weather.get("weather_code"),
                },
            )
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def geocode_city(self, city: str):
        # Build URL manually to guarantee UTF-8 percent-encoding for Cyrillic names.
        city_q = quote(city, safe="", encoding="utf-8", errors="strict")
        url = f"https://nominatim.openstreetmap.org/search?q={city_q}&format=json&limit=1"
        req = Request(
            url,
            headers={
                "User-Agent": "simple-yandex-weather-app/1.0",
                "Accept-Language": "ru",
            },
        )
        with urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        if not data:
            raise ValueError("Город не найден")

        return data[0]["lat"], data[0]["lon"]

    def fetch_weather(self, lat: str, lon: str, requested_date: str):
        params = urlencode(
            {
                "latitude": lat,
                "longitude": lon,
                "daily": (
                    "temperature_2m_min,temperature_2m_max,"
                    "apparent_temperature_min,apparent_temperature_max,weather_code"
                ),
                "start_date": requested_date,
                "end_date": requested_date,
                "timezone": "auto",
            },
            encoding="utf-8",
            errors="strict",
        )
        url = f"https://api.open-meteo.com/v1/forecast?{params}"
        req = Request(url)
        with urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        daily = data.get("daily")
        if not daily:
            raise ValueError("Некорректный ответ Open-Meteo")

        return {
            "temperature_2m_min": self.first_value(daily, "temperature_2m_min"),
            "temperature_2m_max": self.first_value(daily, "temperature_2m_max"),
            "apparent_temperature_min": self.first_value(daily, "apparent_temperature_min"),
            "apparent_temperature_max": self.first_value(daily, "apparent_temperature_max"),
            "weather_code": self.first_value(daily, "weather_code"),
        }

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    @staticmethod
    def first_value(obj: dict, key: str):
        value = obj.get(key)
        if isinstance(value, list) and value:
            return value[0]
        return None

if __name__ == "__main__":
    handler = partial(WeatherHandler, directory=BASE_DIR)
    server = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"Server started: http://{HOST}:{PORT}")
    server.serve_forever()
