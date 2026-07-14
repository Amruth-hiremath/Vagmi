from __future__ import annotations
# hewice9030@acoxs.com
import json
import base64
import re
import threading
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen
from notifypy import Notify
import webview
import mimetypes
import subprocess
import platform
import webbrowser

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")

from audio.recorder import VoiceRecorder

BACKEND_BASE_URL = "http://127.0.0.1:8000"

HOST = "127.0.0.1"

PORT = 0


def _save_dialog(filename: str) -> str | None:
    """Open a native "Save As" dialog. Returns the chosen path or None."""

    try:
        window = webview.active_window()
    except Exception:
        return None

    if window is None:
        return None

    safe_name = Path(filename or "attachment").name

    try:
        result = window.create_file_dialog(
            webview.SAVE_DIALOG,
            "",
            False,
            safe_name
        )
    except Exception:
        return None

    if not result:
        return None

    # pywebview returns a tuple on Windows, a string elsewhere.
    if isinstance(result, (list, tuple)):
        if len(result) == 0:
            return None
        return str(result[0])

    return str(result)

voice_recorder = VoiceRecorder()

class DesktopBridge:
    def save_chat_download(self, data_url: str, filename: str) -> str:
        
        match = re.match(r"^data:.*?;base64,(.*)$", data_url, flags=re.DOTALL)
        if not match:
            raise ValueError("Invalid download payload")

        payload = base64.b64decode(match.group(1))
        safe_name = Path(filename or "attachment").name
        

        chosen_path = _save_dialog(safe_name)
        if not chosen_path:
            return ""
        
        

        target_path = Path(chosen_path)
        if safe_name and Path(safe_name).suffix and target_path.suffix.lower() != Path(safe_name).suffix.lower():
            target_path = target_path.with_suffix(Path(safe_name).suffix)

        target_path.parent.mkdir(parents=True, exist_ok=True)

        if target_path.exists():
            stem = target_path.stem
            suffix = target_path.suffix
            counter = 1
            while True:
                candidate = target_path.with_name(f"{stem} ({counter}){suffix}")
                if not candidate.exists():
                    target_path = candidate
                    break
                counter += 1

        
        target_path.write_bytes(payload)
        
        return str(target_path)
    def show_notification(
        self,
        title: str,
        message: str
    ):
        notification = Notify()

        notification.application_name = "Vāgmi"
        notification.icon = str(
            Path(__file__).resolve().parent
            / "web"
            / "assets"
            / "logo_dark.png"
        )

        notification.title = title
        notification.message = message

        notification.send()

        system = platform.system()

        try:
            if system == "Darwin":
                subprocess.Popen([
                    "afplay",
                    "/System/Library/Sounds/Glass.aiff"
                ])

            elif system == "Windows":
                import winsound
                winsound.MessageBeep(winsound.MB_ICONINFORMATION)

        except Exception:
            pass

    def start_voice_recording(self):

        voice_recorder.start()

    def stop_voice_recording(self):

        

        result = voice_recorder.stop()


        return result

       
    


class VagmiRequestHandler(SimpleHTTPRequestHandler):

    protocol_version = "HTTP/1.1"

    backend_base_url = BACKEND_BASE_URL

    def log_message(self, format: str, *args) -> None:
        return

    def _safe_write(self, payload: bytes) -> None:
        if not payload:
            return

        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionAbortedError):
            pass

    def _copy_response_headers(self, headers, payload_length: int) -> None:
        for key, value in headers:
            lower_key = key.lower()

            if lower_key in {
                "connection",
                "keep-alive",
                "proxy-authenticate",
                "proxy-authorization",
                "te",
                "trailer",
                "transfer-encoding",
                "upgrade",
                "content-length",
            }:
                continue

            self.send_header(key, value)

        self.send_header("Content-Length", str(payload_length))

    def _proxy_api_request(self) -> None:
        parsed = urlsplit(self.path)
        backend_path = parsed.path.removeprefix("/api")

        if not backend_path:
            backend_path = "/"

        parsed_backend = urlsplit(BACKEND_BASE_URL)

        target = urlunsplit((
            parsed_backend.scheme,
            parsed_backend.netloc,
            backend_path,
            parsed.query,
            ""
        ))

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(content_length) if content_length > 0 else None

        request = Request(target, data=body, method=self.command)

        for key, value in self.headers.items():
            lower_key = key.lower()

            if lower_key in {
                "host",
                "connection",
                "keep-alive",
                "proxy-authenticate",
                "proxy-authorization",
                "te",
                "trailer",
                "transfer-encoding",
                "upgrade",
                "content-length",
            }:
                continue

            request.add_header(key, value)

        try:
            with urlopen(request, timeout=600) as response:
                payload = response.read()
                self.send_response(response.status)
                self._copy_response_headers(response.headers.items(), len(payload))
                self.end_headers()
                self._safe_write(payload)

        except HTTPError as error:
            payload = error.read()
            self.send_response(error.code)
            self._copy_response_headers(error.headers.items(), len(payload))
            self.end_headers()
            self._safe_write(payload)

        except URLError as error:
            payload = json.dumps({
                "detail": "Backend is not reachable.\nStart FastAPI first.",
                "backend_url": BACKEND_BASE_URL,
                "error": str(error.reason)
            }).encode("utf-8")

            try:
                self.send_response(HTTPStatus.BAD_GATEWAY)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self._safe_write(payload)
            except (BrokenPipeError, ConnectionAbortedError):
                pass

    def do_GET(self) -> None:
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_api_request()
            return

        super().do_GET()

    def do_POST(self) -> None:
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_api_request()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self) -> None:
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_api_request()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PATCH(self) -> None:
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_api_request()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_api_request()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_OPTIONS(self) -> None:
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_api_request()
            return

        super().do_OPTIONS()


class SymlinkHandler(VagmiRequestHandler):
    def translate_path(self, path):
        result = super().translate_path(path)
        return str(Path(result).resolve())


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    web_root = base_dir / "web"

    if not web_root.exists():
        raise FileNotFoundError(f"Frontend folder not found: {web_root}")

    handler = partial(
        SymlinkHandler,
        directory=str(web_root)
    )

    server = ThreadingHTTPServer((HOST, PORT), handler)
    server_port = server.server_address[1]

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        print(f"Starting single window on port {server_port}")
        window = webview.create_window(
            title="Vāgmi - Secure Workspace",
            url=f"http://{HOST}:{server_port}/splash.html",
            width=1600,
            height=1000,
            min_size=(1280, 840),
            background_color="#000000",
            resizable=True,
            js_api=DesktopBridge(),
        )
        webview.start(window.maximize, debug=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()