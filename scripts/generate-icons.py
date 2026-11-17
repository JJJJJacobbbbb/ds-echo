"""生成 DS Echo 的应用图标与启动图。

主图形来自 `tools/icon-selection.json`——那是在 `tools/icon-grid.html` 工作台里手选的
「条形地砖」组合（回字形交错的地砖语言）。这里把它按真实几何复原、等比缩放到
Android 自适应图标的安全区内，并输出各密度资源。

为什么用「块坐标」而不是工作台导出的归一化坐标：
归一化坐标是相对当时窗口宽高各自归一化的，窗口不是正方形时比例会失真；
而块坐标（列、行、子块）加上固定的块边长，能精确复原每一块砖的位置和大小。

用法： python scripts/generate-icons.py
"""
import json
import math
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SELECTION = ROOT / "tools" / "icon-selection.json"

BLUE = (61, 124, 255, 255)
WHITE = (255, 255, 255, 255)
BLUE_HEX = "#3D7CFF"

CANVAS = 108            # 自适应图标画布（dp）
# 图形占的宽度（dp）。图形是 2:1 的横条：
# 66（标准安全区）在桌面 168px 下显得偏小；82 两端会贴到圆形遮罩边缘被切；74 是实测最稳的中间值
SAFE = 74
LEGACY_RATIO = 0.72     # 传统图标（48dp）里图形占的比例
SPLASH_RATIO = 0.20     # 启动图里图形占短边的比例
SS = 8                  # 超采样倍数

DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def load_rects() -> list[tuple[float, float, float, float]]:
    """从选择文件复原每块砖的矩形（工作台坐标，块边长 block）"""
    data = json.loads(SELECTION.read_text(encoding="utf-8"))
    block = data["block"]
    half = block / 2
    rects = []
    for key in data["cells"]:
        _, col, row, sub = key.split(":")
        col, row, sub = int(col), int(row), int(sub)
        x, y = col * block, row * block
        if (row + col) % 2 == 0:
            # 横排方块：上下两条横砖
            rects.append((x, y + sub * half, x + block, y + (sub + 1) * half))
        else:
            # 竖排方块：左右两条竖砖
            rects.append((x + sub * half, y, x + (sub + 1) * half, y + block))
    return rects


def fit(rects, box: float) -> tuple[float, float, float]:
    """把整组砖等比塞进边长 box 的居中方块；返回 (缩放, x 偏移, y 偏移) 与包围框"""
    x0 = min(r[0] for r in rects)
    x1 = max(r[2] for r in rects)
    y0 = min(r[1] for r in rects)
    y1 = max(r[3] for r in rects)
    scale = box / max(x1 - x0, y1 - y0)
    w = (x1 - x0) * scale
    h = (y1 - y0) * scale
    return scale, -x0 * scale + (box - w) / 2, -y0 * scale + (box - h) / 2, (x0, y0, x1, y1)


def render(canvas_px: int, box_px: float, rects, bg=WHITE) -> Image.Image:
    """按像素渲染；box_px 是图形所占的边长"""
    big = canvas_px * SS
    img = Image.new("RGBA", (big, big), bg)
    d = ImageDraw.Draw(img)
    scale, ox, oy, _ = fit(rects, box_px * SS)
    # 图形整体在画布中居中
    pad = (big - box_px * SS) / 2
    for (a, b, c, e) in rects:
        d.rectangle(
            [a * scale + ox + pad, b * scale + oy + pad,
             c * scale + ox + pad, e * scale + oy + pad],
            fill=BLUE,
        )
    return img.resize((canvas_px, canvas_px), Image.LANCZOS)


def vector_xml(rects) -> str:
    """把每块砖写成 VectorDrawable path（安全区内的多边形）"""
    scale, ox, oy, (x0, y0, x1, y1) = fit(rects, SAFE)
    left = (CANVAS - SAFE) / 2
    top = (CANVAS - SAFE) / 2
    parts = []
    for (a, b, c, e) in rects:
        pts = [
            (a * scale + ox + left, b * scale + oy + top),
            (c * scale + ox + left, b * scale + oy + top),
            (c * scale + ox + left, e * scale + oy + top),
            (a * scale + ox + left, e * scale + oy + top),
        ]
        d = "M" + " L".join(f"{px:.2f},{py:.2f}" for px, py in pts) + " Z"
        parts.append(f'    <path android:fillColor="{BLUE_HEX}" android:pathData="{d}" />')
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!-- 由 scripts/generate-icons.py 生成，请勿手改 -->\n"
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        f'    android:width="{CANVAS}dp"\n'
        f'    android:height="{CANVAS}dp"\n'
        f'    android:viewportWidth="{CANVAS}"\n'
        f'    android:viewportHeight="{CANVAS}">\n'
        + "\n".join(parts)
        + "\n</vector>\n"
    )


ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- 由 scripts/generate-icons.py 生成，请勿手改 -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <!-- Android 13+ 主题图标：系统按壁纸取色重新着色，只看 alpha 通道 -->
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
"""


def main() -> None:
    rects = load_rects()
    print(f"读取到 {len(rects)} 块砖")

    drawable = RES / "drawable"
    drawable.mkdir(exist_ok=True)
    (drawable / "ic_launcher_foreground.xml").write_text(vector_xml(rects), encoding="utf-8")

    anydpi = RES / "mipmap-anydpi-v26"
    anydpi.mkdir(exist_ok=True)
    (anydpi / "ic_launcher.xml").write_text(ADAPTIVE_XML, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(ADAPTIVE_XML, encoding="utf-8")

    for name, factor in DENSITIES.items():
        d = RES / f"mipmap-{name}"
        d.mkdir(exist_ok=True)
        canvas_dp = 108                                    # 自适应前景层
        legacy_dp = 48                                     # 传统图标
        render(round(canvas_dp * factor), SAFE, rects).save(d / "ic_launcher_foreground.png")
        legacy = render(round(legacy_dp * factor), legacy_dp * LEGACY_RATIO, rects)
        legacy.save(d / "ic_launcher.png")
        # 圆形版本：直接给传统图标套圆
        mask = Image.new("L", (legacy.width * 4, legacy.height * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, legacy.width * 4 - 1, legacy.height * 4 - 1], fill=255)
        rounded = legacy.copy()
        rounded.putalpha(mask.resize(legacy.size, Image.LANCZOS))
        rounded.save(d / "ic_launcher_round.png")

    for path in sorted(RES.glob("drawable*/*splash*.png")):
        with Image.open(path) as src:
            size = src.size
        mark = min(size) * SPLASH_RATIO * 2
        big = Image.new("RGBA", (size[0] * 2, size[1] * 2), WHITE)
        scaled = render(round(mark), mark, rects).resize((round(mark), round(mark)), Image.LANCZOS)
        big.alpha_composite(scaled, ((big.width - scaled.width) // 2, (big.height - scaled.height) // 2))
        big.convert("RGB").resize(size, Image.LANCZOS).save(path)

    print("已生成：矢量前景 / 自适应图标 / 5 档传统图标 / 11 张启动图")


if __name__ == "__main__":
    main()
