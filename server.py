import json
import os
import sqlite3
from datetime import date, datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen

PORT = int(os.getenv("PORT", "10000"))
HOST = os.getenv("HOST", "0.0.0.0")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "analytics.db")
ANALYTICS_PASSWORD = os.getenv("ANALYTICS_PASSWORD", "1996")
ANALYTICS_COOKIE_NAME = "analytics_auth"
ANALYTICS_COOKIE_VALUE = "ok"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db_connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db_connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analytics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                event_type TEXT NOT NULL,
                client_id TEXT,
                session_id TEXT,
                path TEXT,
                city_input TEXT,
                city_resolved TEXT,
                country TEXT,
                country_code TEXT,
                target_date TEXT,
                purpose TEXT,
                link_url TEXT,
                error_code TEXT,
                error_message TEXT,
                load_ms REAL,
                meta_json TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics_events(ts)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_analytics_client_day ON analytics_events(client_id, ts)"
        )
        conn.commit()
    finally:
        conn.close()


def event_row_to_dict(row):
    return {k: row[k] for k in row.keys()}


def log_event(event_type: str, **kwargs):
    conn = db_connect()
    try:
        payload = {
            "ts": utc_now_iso(),
            "event_type": event_type,
            "client_id": kwargs.get("client_id"),
            "session_id": kwargs.get("session_id"),
            "path": kwargs.get("path"),
            "city_input": kwargs.get("city_input"),
            "city_resolved": kwargs.get("city_resolved"),
            "country": kwargs.get("country"),
            "country_code": kwargs.get("country_code"),
            "target_date": kwargs.get("target_date"),
            "purpose": kwargs.get("purpose"),
            "link_url": kwargs.get("link_url"),
            "error_code": kwargs.get("error_code"),
            "error_message": kwargs.get("error_message"),
            "load_ms": kwargs.get("load_ms"),
            "meta_json": json.dumps(kwargs.get("meta") or {}, ensure_ascii=False),
        }
        conn.execute(
            """
            INSERT INTO analytics_events (
                ts, event_type, client_id, session_id, path,
                city_input, city_resolved, country, country_code,
                target_date, purpose, link_url, error_code,
                error_message, load_ms, meta_json
            ) VALUES (
                :ts, :event_type, :client_id, :session_id, :path,
                :city_input, :city_resolved, :country, :country_code,
                :target_date, :purpose, :link_url, :error_code,
                :error_message, :load_ms, :meta_json
            )
            """,
            payload,
        )
        conn.commit()
    finally:
        conn.close()


def query_rows(sql: str, params=()):
    conn = db_connect()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [event_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def query_one(sql: str, params=()):
    conn = db_connect()
    try:
        row = conn.execute(sql, params).fetchone()
        return event_row_to_dict(row) if row else None
    finally:
        conn.close()


def build_analytics_payload():
    views_by_day = query_rows(
        """
        SELECT substr(ts, 1, 10) AS day, COUNT(*) AS count
        FROM analytics_events
        WHERE event_type = 'page_view'
        GROUP BY day
        ORDER BY day DESC
        LIMIT 30
        """
    )

    dates_clicked = query_rows(
        """
        SELECT target_date, COUNT(*) AS count
        FROM analytics_events
        WHERE event_type = 'weather_search' AND target_date IS NOT NULL
        GROUP BY target_date
        ORDER BY count DESC, target_date DESC
        LIMIT 20
        """
    )

    total_users_row = query_one(
        """
        SELECT COUNT(DISTINCT client_id) AS total_users
        FROM analytics_events
        WHERE client_id IS NOT NULL AND client_id != ''
        """
    )
    returning_row = query_one(
        """
        SELECT COUNT(*) AS returning_users
        FROM (
            SELECT client_id
            FROM analytics_events
            WHERE client_id IS NOT NULL AND client_id != ''
            GROUP BY client_id
            HAVING COUNT(DISTINCT substr(ts, 1, 10)) > 1
        )
        """
    )

    d1_row = query_one(
        """
        WITH user_days AS (
            SELECT DISTINCT client_id, substr(ts, 1, 10) AS day
            FROM analytics_events
            WHERE client_id IS NOT NULL AND client_id != ''
        ),
        pairs AS (
            SELECT ud.client_id, ud.day,
                   CASE WHEN EXISTS (
                       SELECT 1
                       FROM user_days ud2
                       WHERE ud2.client_id = ud.client_id
                         AND ud2.day = date(ud.day, '+1 day')
                   ) THEN 1 ELSE 0 END AS retained
            FROM user_days ud
            WHERE ud.day < date('now')
        )
        SELECT
            COUNT(*) AS base_days,
            COALESCE(SUM(retained), 0) AS retained_days
        FROM pairs
        """
    )

    total_users = (total_users_row or {}).get("total_users", 0) or 0
    returning_users = (returning_row or {}).get("returning_users", 0) or 0
    base_days = (d1_row or {}).get("base_days", 0) or 0
    retained_days = (d1_row or {}).get("retained_days", 0) or 0

    link_clicks_total = query_one(
        "SELECT COUNT(*) AS total FROM analytics_events WHERE event_type = 'link_click'"
    )
    top_links = query_rows(
        """
        SELECT link_url, COUNT(*) AS count
        FROM analytics_events
        WHERE event_type = 'link_click' AND link_url IS NOT NULL
        GROUP BY link_url
        ORDER BY count DESC
        LIMIT 20
        """
    )

    errors_total = query_one(
        "SELECT COUNT(*) AS total FROM analytics_events WHERE event_type = 'error'"
    )
    errors_by_code = query_rows(
        """
        SELECT COALESCE(error_code, 'unknown') AS code, COUNT(*) AS count
        FROM analytics_events
        WHERE event_type = 'error'
        GROUP BY code
        ORDER BY count DESC
        """
    )
    recent_errors = query_rows(
        """
        SELECT substr(ts, 1, 19) AS ts, COALESCE(error_message, '') AS message
        FROM analytics_events
        WHERE event_type = 'error'
        ORDER BY ts DESC
        LIMIT 10
        """
    )

    perf_row = query_one(
        """
        SELECT
            COUNT(*) AS samples,
            ROUND(AVG(load_ms), 2) AS avg_ms,
            ROUND(MAX(load_ms), 2) AS max_ms
        FROM analytics_events
        WHERE event_type = 'page_perf' AND load_ms IS NOT NULL
        """
    )
    p95_row = query_one(
        """
        SELECT ROUND(load_ms, 2) AS p95_ms
        FROM analytics_events
        WHERE event_type = 'page_perf' AND load_ms IS NOT NULL
        ORDER BY load_ms
        LIMIT 1 OFFSET (
            SELECT CAST(COUNT(*) * 0.95 AS INT)
            FROM analytics_events
            WHERE event_type = 'page_perf' AND load_ms IS NOT NULL
        )
        """
    )

    entered_cities = query_rows(
        """
        SELECT city_input AS city, COUNT(*) AS count
        FROM analytics_events
        WHERE event_type = 'weather_search' AND city_input IS NOT NULL AND city_input != ''
        GROUP BY city_input
        ORDER BY count DESC
        LIMIT 20
        """
    )

    resolved_countries = query_rows(
        """
        SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS count
        FROM analytics_events
        WHERE event_type = 'weather_search'
        GROUP BY COALESCE(country, 'Unknown')
        ORDER BY count DESC
        LIMIT 20
        """
    )

    return {
        "viewsByDay": views_by_day,
        "datesClicked": dates_clicked,
        "retention": {
            "totalUsers": total_users,
            "returningUsers": returning_users,
            "returningRate": round((returning_users / total_users) * 100, 2)
            if total_users
            else 0,
            "d1RetentionRate": round((retained_days / base_days) * 100, 2)
            if base_days
            else 0,
        },
        "linkClicks": {
            "total": (link_clicks_total or {}).get("total", 0) or 0,
            "topLinks": top_links,
        },
        "errors": {
            "total": (errors_total or {}).get("total", 0) or 0,
            "byCode": errors_by_code,
            "recent": recent_errors,
        },
        "pageLoad": {
            "samples": (perf_row or {}).get("samples", 0) or 0,
            "avgMs": (perf_row or {}).get("avg_ms", 0) or 0,
            "p95Ms": (p95_row or {}).get("p95_ms", 0) or 0,
            "maxMs": (perf_row or {}).get("max_ms", 0) or 0,
        },
        "searchGeo": {
            "enteredCities": entered_cities,
            "countries": resolved_countries,
        },
    }


class WeatherHandler(SimpleHTTPRequestHandler):
    def parse_cookies(self):
        raw = self.headers.get("Cookie", "")
        cookies = {}
        for chunk in raw.split(";"):
            if "=" not in chunk:
                continue
            key, value = chunk.split("=", 1)
            cookies[key.strip()] = value.strip()
        return cookies

    def is_analytics_authorized(self) -> bool:
        cookies = self.parse_cookies()
        return cookies.get(ANALYTICS_COOKIE_NAME) == ANALYTICS_COOKIE_VALUE

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/weather":
            self.handle_weather(parsed.query)
            return

        if parsed.path == "/api/analytics":
            if not self.is_analytics_authorized():
                self.send_json(401, {"error": "Unauthorized"})
                return
            self.handle_analytics()
            return

        if parsed.path == "/analytics-login":
            self.path = "/analytics-login.html"
            return super().do_GET()

        if parsed.path == "/analytics":
            if not self.is_analytics_authorized():
                self.path = "/analytics-login.html"
                return super().do_GET()
            self.path = "/analytics.html"
            return super().do_GET()

        if parsed.path == "/":
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/analytics-login":
            self.handle_analytics_login()
            return

        if parsed.path == "/api/track":
            self.handle_track_event()
            return

        self.send_response(404)
        self.end_headers()

    def handle_analytics_login(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length) if content_length else b"{}"
            data = json.loads(raw_body.decode("utf-8"))
            password = (data.get("password") or "").strip()

            if password != ANALYTICS_PASSWORD:
                self.send_json(401, {"error": "Неверный пароль"})
                return

            body = json.dumps({"ok": True}, ensure_ascii=True).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header(
                "Set-Cookie",
                f"{ANALYTICS_COOKIE_NAME}={ANALYTICS_COOKIE_VALUE}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax",
            )
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def handle_analytics(self):
        try:
            payload = build_analytics_payload()
            self.send_json(200, payload)
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def handle_track_event(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length) if content_length else b"{}"
            data = json.loads(raw_body.decode("utf-8"))

            event_type = (data.get("eventType") or "").strip()
            if not event_type:
                self.send_json(400, {"error": "eventType is required"})
                return

            log_event(
                event_type,
                client_id=(data.get("clientId") or "").strip(),
                session_id=(data.get("sessionId") or "").strip(),
                path=(data.get("path") or "").strip(),
                city_input=(data.get("cityInput") or "").strip(),
                city_resolved=(data.get("cityResolved") or "").strip(),
                country=(data.get("country") or "").strip(),
                country_code=(data.get("countryCode") or "").strip(),
                target_date=(data.get("targetDate") or "").strip(),
                purpose=(data.get("purpose") or "").strip(),
                link_url=(data.get("linkUrl") or "").strip(),
                error_code=(data.get("errorCode") or "").strip(),
                error_message=(data.get("errorMessage") or "").strip(),
                load_ms=data.get("loadMs"),
                meta=data.get("meta") or {},
            )
            self.send_json(200, {"ok": True})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def handle_weather(self, query: str):
        params = parse_qs(query)
        city = (params.get("city", [""])[0] or "").strip()
        requested_date = (params.get("date", [""])[0] or "").strip()
        purpose = (params.get("purpose", [""])[0] or "").strip()
        client_id = (params.get("clientId", [""])[0] or "").strip()
        session_id = (params.get("sessionId", [""])[0] or "").strip()

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
            location = self.geocode_city(city)
            weather = self.fetch_weather(location["lat"], location["lon"], requested_date)

            log_event(
                "weather_search",
                client_id=client_id,
                session_id=session_id,
                path="/api/weather",
                city_input=city,
                city_resolved=location.get("resolved_city"),
                country=location.get("country"),
                country_code=location.get("country_code"),
                target_date=requested_date,
                purpose=purpose,
            )

            self.send_json(
                200,
                {
                    "city": location.get("resolved_city") or city,
                    "date": requested_date,
                    "tempMin": weather.get("temperature_2m_min"),
                    "tempMax": weather.get("temperature_2m_max"),
                    "feelsLikeMin": weather.get("apparent_temperature_min"),
                    "feelsLikeMax": weather.get("apparent_temperature_max"),
                    "weatherCode": weather.get("weather_code"),
                    "country": location.get("country"),
                },
            )
        except Exception as error:
            log_event(
                "error",
                client_id=client_id,
                session_id=session_id,
                path="/api/weather",
                city_input=city,
                target_date=requested_date,
                purpose=purpose,
                error_code="weather_fetch_failed",
                error_message=str(error),
            )
            self.send_json(500, {"error": str(error)})

    def geocode_city(self, city: str):
        city_q = quote(city, safe="", encoding="utf-8", errors="strict")
        url = (
            "https://nominatim.openstreetmap.org/search"
            f"?q={city_q}&format=json&limit=1&addressdetails=1"
        )
        req = Request(
            url,
            headers={
                "User-Agent": "simple-weather-app-analytics/1.0",
                "Accept-Language": "ru",
            },
        )
        with urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        if not data:
            raise ValueError("Город не найден")

        first = data[0]
        address = first.get("address") or {}
        resolved_city = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or first.get("display_name", city).split(",")[0].strip()
        )
        return {
            "lat": first["lat"],
            "lon": first["lon"],
            "resolved_city": resolved_city,
            "country": address.get("country"),
            "country_code": (address.get("country_code") or "").upper(),
        }

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
    init_db()
    handler = partial(WeatherHandler, directory=BASE_DIR)
    server = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"Server started: http://{HOST}:{PORT}")
    server.serve_forever()
