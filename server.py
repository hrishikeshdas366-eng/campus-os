#!/usr/bin/env python3
"""Campus OS — local server.

Serves the web app in ./docs and saves your data to ./data/store.json on this Mac.
Only the Python standard library is used; no internet connection is needed.

    python3 server.py              # starts and opens your browser
    python3 server.py --no-browser
"""
import json
import os
import shutil
import socket
import sys
import threading
import webbrowser
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "docs")
DATA_DIR = os.path.join(BASE_DIR, "data")
STORE_PATH = os.path.join(DATA_DIR, "store.json")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
DEFAULT_PORT = 8765
KEEP_BACKUPS = 30
MAX_BODY = 25 * 1024 * 1024

_lock = threading.Lock()

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}


# ------------------------------------------------------------------ storage
def read_store():
    if not os.path.exists(STORE_PATH):
        return None
    with open(STORE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def write_store(doc):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    # one rolling backup per day, taken before the first save of that day
    daily = os.path.join(BACKUP_DIR, "store-{}.json".format(date.today().isoformat()))
    if os.path.exists(STORE_PATH) and not os.path.exists(daily):
        shutil.copy2(STORE_PATH, daily)
        old = sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith("store-"))
        for f in old[:-KEEP_BACKUPS]:
            os.remove(os.path.join(BACKUP_DIR, f))
    tmp = STORE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STORE_PATH)



# ------------------------------------------------------------------ http
class Handler(BaseHTTPRequestHandler):
    server_version = "CampusOS/2.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, status, payload, ctype="application/json; charset=utf-8"):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/ping":
            return self._send(200, {"app": "campus-os", "storage": "disk", "path": STORE_PATH})
        if path == "/api/store":
            with _lock:
                try:
                    doc = read_store()
                except (OSError, ValueError) as e:
                    return self._send(500, {"error": "Could not read store.json: {}".format(e)})
            return self._send(200, {"data": doc})
        return self._static(path)

    def do_PUT(self):
        if urlparse(self.path).path != "/api/store":
            return self._send(404, {"error": "Not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._send(413, {"error": "Data too large"})
        try:
            doc = json.loads(self.rfile.read(length) or b"null")
        except ValueError:
            return self._send(400, {"error": "Invalid JSON"})
        if not isinstance(doc, dict) or doc.get("app") != "campus-os":
            return self._send(400, {"error": "Not a Campus OS document"})
        doc["savedAt"] = datetime.now().isoformat(timespec="seconds")
        with _lock:
            try:
                write_store(doc)
            except OSError as e:
                return self._send(500, {"error": "Could not save: {}".format(e)})
        return self._send(200, {"ok": True, "savedAt": doc["savedAt"]})

    def _static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        full = os.path.normpath(os.path.join(WEB_DIR, path.lstrip("/")))
        if not full.startswith(WEB_DIR + os.sep) or not os.path.isfile(full):
            return self._send(404, b"Not found", "text/plain")
        with open(full, "rb") as f:
            data = f.read()
        self._send(200, data, MIME.get(os.path.splitext(full)[1], "application/octet-stream"))


def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def ours_running(port):
    import urllib.request
    try:
        with urllib.request.urlopen("http://127.0.0.1:{}/api/ping".format(port), timeout=1) as r:
            return r.headers.get("Server", "").startswith("CampusOS")
    except Exception:
        return False


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    no_browser = "--no-browser" in sys.argv
    port = DEFAULT_PORT
    if not port_free(port):
        if ours_running(port):
            url = "http://127.0.0.1:{}".format(port)
            print("Campus OS is already running at", url)
            if not no_browser:
                webbrowser.open(url)
            return
        port = next(p for p in range(DEFAULT_PORT + 1, DEFAULT_PORT + 50) if port_free(p))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = "http://127.0.0.1:{}".format(port)
    print("=" * 56)
    print("  CAMPUS OS is running  ->  {}".format(url))
    print("  Your data: {}".format(STORE_PATH))
    print("  Close this window or press Ctrl+C to stop.")
    print("=" * 56)
    if not no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
