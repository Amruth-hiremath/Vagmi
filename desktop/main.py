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
import time

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")

from audio.recorder import VoiceRecorder

BACKEND_BASE_URL = "http://127.0.0.1:8000"

HOST = "127.0.0.1"

PORT = 0

APP_WINDOW = None
SERVER_PORT = None

# Background color for the floating mini-dock window. Deliberately NOT pure
# black (#000000) — the main window uses pure black, which is what made the
# old in-window mini-dock look like a black square. This themed dark surface
# matches the app's `--surface` token so the floating panel reads as a card.
MINI_WINDOW_BG = "#0f1117"
MINI_DEFAULT_WIDTH = 320
MINI_DEFAULT_HEIGHT = 460


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

       
    


    # ------------------------------------------------------------------
    # Compact / floating mode
    # ------------------------------------------------------------------
    #
    # The mini-dock is a *separate* pywebview window that is created at
    # startup (hidden=True) and toggled with show()/hide(). This is far more
    # reliable than calling webview.create_window() from inside a JS API
    # callback (which runs in a worker thread and can silently fail on some
    # platforms).
    #
    # Lifecycle:
    #   - Startup: both main + mini windows are created before
    #     webview.start(). The mini window starts hidden.
    #   - enter_compact_mode(): show mini, hide main.
    #   - exit_compact_mode():  show main, hide mini.
    #   - User force-closes mini (Alt+F4): the `closed` event restores
    #     the main window so they aren't stranded.

    def __init__(self) -> None:
        self._mini_window = None
        self._main_window_ref = None

    def _set_windows(self, main_window, mini_window) -> None:
        """Called from main() to inject the pre-created window objects."""
        self._main_window_ref = main_window
        self._mini_window = mini_window

    def _main_window(self):
        return self._main_window_ref or globals().get("APP_WINDOW") or webview.active_window()

    def ping(self) -> str:
        """Health-check method. Call from JS console:
        `await window.pywebview.api.ping()` should return "pong".
        """
        return "pong"

    def bridge_status(self) -> str:
        """Return a JSON-ish status string for debugging from the JS console."""
        has_enter = hasattr(self, "enter_compact_mode")
        has_exit = hasattr(self, "exit_compact_mode")
        has_restore = hasattr(self, "restore_with_page")
        has_mini = self._mini_window is not None
        has_main = self._main_window() is not None
        return (
            f"ping=pong "
            f"enter_compact_mode={has_enter} "
            f"exit_compact_mode={has_exit} "
            f"restore_with_page={has_restore} "
            f"mini_window_ready={has_mini} "
            f"main_window_ready={has_main}"
        )

    def set_workspace_compact(self, enabled: bool, width: int = 380, height: int = 260, x: int | None = None, y: int | None = None) -> bool:
        """Backward-compatible shim — delegates to the new methods."""
        if enabled:
            return self.enter_compact_mode()
        return self.exit_compact_mode()

    def enter_compact_mode(self) -> bool:
        """Show the floating mini-dock and hide the main window."""
        try:
            main_window = self._main_window()
            mini_window = self._mini_window

            if main_window is None or mini_window is None:
                return False

            # Show the floating dock first, then hide the main window —
            # this way the user never sees a "no window at all" flash.
            try:
                mini_window.show()
            except Exception:
                pass

            try:
                main_window.hide()
            except Exception:
                pass

            return True
        except Exception:
            return False

    def exit_compact_mode(self) -> bool:
        """Show the main window and hide the floating mini-dock."""
        try:
            main_window = self._main_window()

            if main_window is not None:
                try:
                    main_window.show()
                except Exception:
                    pass
                try:
                    main_window.restore()
                except Exception:
                    pass

            if self._mini_window is not None:
                try:
                    self._mini_window.hide()
                except Exception:
                    pass

            return True
        except Exception:
            return False

    def restore_with_page(self, page: str | None = None) -> bool:
        """Restore the main window and navigate its iframe to `page`.

        Used by the floating mini-dock's quick-action buttons.
        """
        try:
            main_window = self._main_window()
            if main_window is not None:
                try:
                    main_window.show()
                except Exception:
                    pass
                try:
                    main_window.restore()
                except Exception:
                    pass

                if page:
                    safe_page = json.dumps(str(page))
                    js = (
                        "window.vagmiMiniRestore && "
                        f"window.vagmiMiniRestore({safe_page});"
                    )
                    try:
                        main_window.evaluate_js(js)
                    except Exception:
                        pass

            if self._mini_window is not None:
                try:
                    self._mini_window.hide()
                except Exception:
                    pass

            return True
        except Exception:
            return False

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
        except (
            BrokenPipeError,
            ConnectionAbortedError,
            ConnectionResetError,
            OSError,
        ):
            pass

    def _copy_response_headers(self, headers) -> None:
        """
        Copy backend response headers while removing hop-by-hop headers.

        Preserves Content-Length, Content-Type, Accept-Ranges, etc.
        """

        excluded = {
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
            "transfer-encoding",
            "upgrade",
        }

        for key, value in headers:
            if key.lower() in excluded:
                continue

            self.send_header(key, value)

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

                self.send_response(response.status)
                self._copy_response_headers(response.headers.items())
                self.end_headers()

                while True:
                    chunk = response.read(64 * 1024)  # 64 KB
                    if not chunk:
                        break
                    self._safe_write(chunk)

        except HTTPError as error:
            self.send_response(error.code)
            self._copy_response_headers(error.headers.items())
            self.end_headers()

            while True:
                chunk = error.read(64 * 1024)  # 64 KB
                if not chunk:
                    break

                self._safe_write(chunk)

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
            except (
                BrokenPipeError,
                ConnectionAbortedError,
                ConnectionResetError,
                OSError,
            ):
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
    globals()["SERVER_PORT"] = server_port

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        bridge = DesktopBridge()

        # Main window — normal, resizable, maximized on start.
        main_window = webview.create_window(
            title="Vāgmi - Secure Workspace",
            url=f"http://{HOST}:{server_port}/splash.html",
            width=1600,
            height=1000,
            min_size=(800, 600),
            background_color="#000000",
            resizable=True,
            js_api=bridge,
        )
        globals()["APP_WINDOW"] = main_window

        # Mini-dock window — frameless, always-on-top, starts HIDDEN.
        # Pre-creating it (instead of calling create_window from a JS API
        # callback) avoids worker-thread / dispatch issues that can silently
        # swallow window creation on some platforms.
        mini_window = webview.create_window(
            title="Vāgmi Mini",
            url=f"http://{HOST}:{server_port}/mini-dock.html",
            width=MINI_DEFAULT_WIDTH,
            height=MINI_DEFAULT_HEIGHT,
            resizable=False,
            frameless=True,
            on_top=True,
            hidden=True,
            background_color=MINI_WINDOW_BG,
            js_api=bridge,
        )

        # Inject both window handles into the bridge so enter/exit_compact_mode
        # can simply show()/hide() them.
        bridge._set_windows(main_window, mini_window)

        # If the user force-closes the mini window (Alt+F4 / Task Manager),
        # restore the main window so they aren't stranded.
        def _on_mini_closed():
            try:
                main_window.show()
            except Exception:
                pass
            try:
                main_window.restore()
            except Exception:
                pass

        try:
            mini_window.events.closed += _on_mini_closed
        except Exception:
            pass

        # If the main window is closed directly, tear down the mini window
        # so the process can exit cleanly.
        def _on_main_closed():
            try:
                mini_window.destroy()
            except Exception:
                pass

        try:
            main_window.events.closed += _on_main_closed
        except Exception:
            pass

        # debug=False: with two windows, debug=True would spawn devtools for
        # each window on some backends. Keep it off for clean production use.
        webview.start(main_window.maximize, debug=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()