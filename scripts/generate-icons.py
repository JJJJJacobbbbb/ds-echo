"""生成 DS Echo 的应用图标与启动图（替换 Capacitor 默认图标）。

设计：白底 + 蓝色「声呐/回声」标记——中央圆点 + 左右各两条同心弧。
选它的理由：
- 与上游默认图标同一套语言（纯白底、单一蓝色几何图形），改动最小、风格一致
- 声呐是「回声」最直接的隐喻，且左右对称，视觉重心在中心，缩到 48px 仍然认得清
- 纯几何、无文字，不受语言影响

产物：
1. mipmap-*/ic_launcher_foreground.png —— 自适应图标的前景层（108dp 画布，图形限制在 66dp 安全区内）
2. mipmap-*/ic_launcher.png / ic_launcher_round.png —— Android 8 以下的传统图标
3. drawable*/splash.png —— 启动图（白底 + 居中标记）
4. drawable/ic_launcher_monochrome.png 系列 —— Android 13+ 主题图标用的单色层
5. mipmap-anydpi-v26/ic_launcher*.xml —— 自适应图标描述（含 monochrome）

用法： python scripts/generate-icons.py
"""
import math
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"

BLUE = (61, 124, 255, 255)
WHITE = (255, 255, 255, 255)
SS = 8  # 超采样倍数

# 画布 108×108（自适应图标标准），图形最大半径 32，留在 66dp 安全区内
CANVAS = 108
SAFE_RADIUS = 32
DOT_R = 7.0
ARC_RADII = (17.0, 29.0)
ARC_DEG = (-38, 38)
STROKE = 8.0

# 传统图标（Android 8 以下）与启动图里标记占画布的比例
LEGACY_SCALE = 0.72
SPLASH_SCALE = 0.20


def draw_mark(img: Image.Image, cx: float, cy: float, scale: float, color=BLUE):
    """在 img 上画出标记；scale 表示 1dp 对应多少像素。"""
    d = ImageDraw.Draw(img)
    dot = DOT_R * scale
    d.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=color)
    w = max(1, round(STROKE * scale))
    for r in ARC_RADII:
        rr = r * scale
        box = [cx - rr, cy - rr, cx + rr, cy + rr]
        # PIL 角度以 3 点方向为 0、顺时针为正
        d.arc(box, start=ARC_DEG[0], end=ARC_DEG[1], fill=color, width=w)
        d.arc(box, start=180 - ARC_DEG[1], end=180 - ARC_DEG[0], fill=color, width=w)


def render(size: int, mark_ratio: float, bg=WHITE, round_mask=False) -> Image.Image:
    """渲染一张 size×size 的图标；mark_ratio 是标记直径占画布的比例。"""
    big = size * SS
    img = Image.new("RGBA", (big, big), bg)
    # 标记在 108 画布里的外接半径
    extent = ARC_RADII[-1] + STROKE / 2
    target_px = big * mark_ratio / 2          # 目标外接半径（像素）
    scale = target_px / extent               # 1dp → 像素
    draw_mark(img, big / 2, big / 2, scale)
    img = img.resize((size, size), Image.LANCZOS)
    if round_mask:
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
        img.putalpha(mask)
    return img


def render_foreground(size: int) -> Image.Image:
    """自适应图标的前景层：透明底，标记按 108dp 画布内的安全区摆放。"""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    scale = big / CANVAS
    draw_mark(img, big / 2, big / 2, scale)
    return img.resize((size, size), Image.LANCZOS)


def vector_paths() -> str:
    """把标记写成 VectorDrawable 的 path（自适应前景用矢量，任何尺寸都清晰）。"""
    cx = cy = CANVAS / 2

    def point(r: float, deg: float) -> tuple[float, float]:
        rad = math.radians(deg)
        return cx + r * math.cos(rad), cy + r * math.sin(rad)

    def arc_path(r: float, a0: float, a1: float) -> str:
        x0, y0 = point(r, a0)
        x1, y1 = point(r, a1)
        sweep = 1 if a1 > a0 else 0
        return (
            f"M{x0:.2f},{y0:.2f} A{r:.2f},{r:.2f} 0 0,{sweep} {x1:.2f},{y1:.2f}"
        )

    paths = [
        f'    <path android:fillColor="#3D7CFF" android:pathData="M{cx - DOT_R:.2f},{cy} '
        f'a{DOT_R:.2f},{DOT_R:.2f} 0 1,0 {DOT_R * 2:.2f},0 '
        f'a{DOT_R:.2f},{DOT_R:.2f} 0 1,0 -{DOT_R * 2:.2f},0" />'
    ]
    for r in ARC_RADII:
        for a0, a1 in ((ARC_DEG[0], ARC_DEG[1]), (180 - ARC_DEG[1], 180 - ARC_DEG[0])):
            paths.append(
                f'    <path android:strokeColor="#3D7CFF" android:strokeWidth="{STROKE}" '
                f'android:strokeLineCap="round" android:pathData="{arc_path(r, a0, a1)}" />'
            )
    return "\n".join(paths)


VECTOR_XML = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- 由 scripts/generate-icons.py 生成，请勿手改 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
{vector_paths()}
</vector>
"""

ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- 由 scripts/generate-icons.py 生成，请勿手改 -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <!-- Android 13+ 主题图标：系统会按壁纸取色重新着色 -->
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
"""

DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}


def main() -> None:
    # 1) 矢量前景
    drawable = RES / "drawable"
    drawable.mkdir(exist_ok=True)
    (drawable / "ic_launcher_foreground.xml").write_text(VECTOR_XML, encoding="utf-8")

    # 2) 自适应图标描述
    anydpi = RES / "mipmap-anydpi-v26"
    anydpi.mkdir(exist_ok=True)
    (anydpi / "ic_launcher.xml").write_text(ADAPTIVE_XML, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(ADAPTIVE_XML, encoding="utf-8")

    # 3) 传统图标（48dp 基准）与前景 PNG 兜底
    for name, factor in DENSITIES.items():
        d = RES / f"mipmap-{name}"
        d.mkdir(exist_ok=True)
        legacy = round(48 * factor)
        render(legacy, LEGACY_SCALE).save(d / "ic_launcher.png")
        render(legacy, LEGACY_SCALE, round_mask=True).save(d / "ic_launcher_round.png")
        render_foreground(round(108 * factor)).save(d / "ic_launcher_foreground.png")

    # 4) 启动图：白底 + 居中标记，保持原有每张图的尺寸
    for path in sorted(RES.glob("drawable*/*splash*.png")):
        with Image.open(path) as src:
            size = src.size
        canvas = Image.new("RGBA", (size[0] * 2, size[1] * 2), WHITE)
        mark_px = min(size) * 2 * SPLASH_SCALE
        extent = ARC_RADII[-1] + STROKE / 2
        draw_mark(canvas, canvas.width / 2, canvas.height / 2, mark_px / 2 / extent)
        canvas.convert("RGB").resize(size, Image.LANCZOS).save(path)

    print("图标与启动图已生成")
    print("  矢量前景: drawable/ic_launcher_foreground.xml")
    print(f"  自适应图标: mipmap-anydpi-v26/ic_launcher{{,_round}}.xml")
    print(f"  传统图标: {len(DENSITIES)} 个密度")
    print(f"  启动图: {len(list(RES.glob('drawable*/*splash*.png')))} 张")


if __name__ == "__main__":
    main()
