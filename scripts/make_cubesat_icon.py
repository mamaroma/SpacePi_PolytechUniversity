"""Превращает cubesat_image.jpg в PNG с прозрачным фоном.

Работает простым алгоритмом «flood fill от углов по белому»: считаем все
пиксели, дотягивающиеся непрерывной светло-белой массой от границ
картинки, фоном — и обнуляем у них альфа-канал.

Параметр `tolerance` управляет «строгостью» определения белого.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "cubesat_image.jpg"
DST_PNG = Path(__file__).resolve().parent.parent / "ui" / "public" / "cubesat-icon.png"
DST_SMALL = Path(__file__).resolve().parent.parent / "ui" / "public" / "cubesat-icon-256.png"


def _is_whitish(px, tol: int) -> bool:
    r, g, b = px[0], px[1], px[2]
    return r > 255 - tol and g > 255 - tol and b > 255 - tol


def remove_white_bg(im: Image.Image, tolerance: int = 28) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    # стартуем со всех границ
    for x in range(w):
        for y in (0, h - 1):
            if _is_whitish(px[x, y], tolerance):
                visited[x][y] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if _is_whitish(px[x, y], tolerance):
                visited[x][y] = True
                q.append((x, y))

    # BFS по соседям 4-связности
    while q:
        x, y = q.popleft()
        r, g, b, _a = px[x, y]
        px[x, y] = (r, g, b, 0)  # делаем прозрачным
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and _is_whitish(
                px[nx, ny], tolerance
            ):
                visited[nx][ny] = True
                q.append((nx, ny))

    return im


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Не нашёл исходник: {SRC}")
    DST_PNG.parent.mkdir(parents=True, exist_ok=True)

    src = Image.open(SRC)
    cleaned = remove_white_bg(src, tolerance=30)
    cleaned.save(DST_PNG, "PNG", optimize=True)

    # уменьшенная версия для leaflet/three sprite
    small = cleaned.copy()
    small.thumbnail((256, 256), Image.LANCZOS)
    small.save(DST_SMALL, "PNG", optimize=True)

    print(f"Saved: {DST_PNG} ({DST_PNG.stat().st_size // 1024} KB)")
    print(f"Saved: {DST_SMALL} ({DST_SMALL.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
