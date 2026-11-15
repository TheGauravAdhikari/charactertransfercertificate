from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import json
import mimetypes
import webbrowser


APP_DIR = Path(__file__).resolve().parent
PHOTOS_DIR = APP_DIR / "Photos"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


class CharacterCertificateHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def do_GET(self):
        request = urlparse(self.path)
        if request.path == "/api/photos":
            self.send_photo_list()
            return
        if request.path == "/api/photo":
            self.send_photo(request.query)
            return
        super().do_GET()

    def send_photo_list(self):
        photos = []
        if PHOTOS_DIR.is_dir():
            for path in PHOTOS_DIR.rglob("*"):
                if path.suffix.lower() not in IMAGE_EXTENSIONS or not path.is_file():
                    continue
                try:
                    relative_path = path.resolve().relative_to(PHOTOS_DIR.resolve())
                except ValueError:
                    continue
                photos.append(relative_path.as_posix())

        payload = json.dumps(sorted(photos)).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def send_photo(self, query):
        names = parse_qs(query).get("name", [])
        if len(names) != 1 or not PHOTOS_DIR.is_dir():
            self.send_error(404, "Photo not found")
            return

        candidate = (PHOTOS_DIR / names[0]).resolve()
        try:
            candidate.relative_to(PHOTOS_DIR.resolve())
        except ValueError:
            self.send_error(404, "Photo not found")
            return

        if not candidate.is_file() or candidate.suffix.lower() not in IMAGE_EXTENSIONS:
            self.send_error(404, "Photo not found")
            return

        try:
            content = candidate.read_bytes()
        except OSError:
            self.send_error(404, "Photo not found")
            return

        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), CharacterCertificateHandler)
    address = f"http://127.0.0.1:{server.server_port}/"
    print("Character Certificate Desk is running.")
    print("Keep this window open while using the app.")
    print("Press Ctrl+C here to close it.")
    print(f"Opening {address}")
    webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nCharacter Certificate Desk stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
