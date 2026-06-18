from pathlib import Path
import webview


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    html_path = base_dir / "web" / "index.html"

    webview.create_window(
        title="Vāgmi - Secure Workspace",
        url=str(html_path),
        width=1600,
        height=1000,
        min_size=(1280, 840),
        background_color="#000000",
        resizable=True,
    )
    webview.start(debug=False)


if __name__ == "__main__":
    main()
