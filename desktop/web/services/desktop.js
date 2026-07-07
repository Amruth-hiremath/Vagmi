// services/desktop.js

export function getDesktopBridge() {
  return (
    window.pywebview?.api ??
    window.parent?.pywebview?.api ??
    window.top?.pywebview?.api ??
    null
  );
}

export async function dataUrlToFile(
  dataUrl,
  filename
) {
  const response = await fetch(dataUrl);

  const blob = await response.blob();

  return new File(
    [blob],
    filename,
    {
      type: blob.type
    }
  );
}