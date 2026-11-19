"""生成 DS Echo 商品图（竖版 1080×1440 与方版 1080×1080）。

为什么用 PIL 排版而不是 AI 生图：
商品图里必须出现**真实界面截图**和**准确的中文卖点**，AI 生成的中文几乎必有错字，
截图也会被"想象"成不存在的 UI。所以这里用真实截图 + 程序化排版，文字 100% 正确。

用法：python .verify/product/make-product.py
输出：deliverables/product-vertical.png / product-square.png
"""
import pathlib

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(r"D:\项目\DSEcho")
SHOT = ROOT / ".verify" / "product" / "shot-chat.png"
ICON = ROOT / "android" / "app" / "src" / "main" / "res" / "mipmap-xxxhdpi" / "ic_launcher_foreground.png"
ICON_BLUE = (61, 124, 255, 255)
OUT = ROOT / "deliverables"
OUT.mkdir(parents=True, exist_ok=True)

YAHEI_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
YAHEI = r"C:\Windows\Fonts\msyh.ttc"

BG_TOP = (9, 14, 24)
BG_BOTTOM = (18, 27, 45)
ACCENT = (74, 134, 255)
TEXT = (240, 245, 252)
MUTED = (150, 165, 190)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def gradient(size: tuple[int, int]) -> Image.Image:
    """竖向渐变底：从近黑到深蓝，避免纯黑显得廉价"""
    width, height = size
    base = Image.new("RGB", size)
    draw = ImageDraw.Draw(base)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(
            round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * ratio) for i in range(3)
        )
        draw.line([(0, y), (width, y)], fill=color)
    return base


def glow(size: tuple[int, int], center: tuple[int, int], radius: int) -> Image.Image:
    """柔和蓝色光晕，垫在手机后面制造层次"""
    layer = Image.new("RGB", size, (0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.ellipse(
        [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
        fill=(30, 70, 160),
    )
    return layer.filter(ImageFilter.GaussianBlur(radius // 3))


def rounded_screen(shot: Image.Image, size: tuple[int, int], radius: int) -> Image.Image:
    """把截图裁成圆角屏幕，模拟手机显示区域"""
    fitted = shot.convert("RGB").resize(size, Image.LANCZOS)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    fitted.putalpha(mask)
    return fitted


def phone(shot_path: pathlib.Path, width: int) -> Image.Image:
    """手机机身：深色边框 + 顶部听筒条 + 圆角屏幕"""
    margin = max(6, width // 42)
    screen_w = width - margin * 2
    screen_h = round(screen_w * 844 / 390)
    body_h = screen_h + margin * 2
    body = Image.new("RGBA", (width, body_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(body)
    draw.rounded_rectangle([0, 0, width - 1, body_h - 1], radius=width // 14, fill=(12, 18, 30, 255))
    draw.rounded_rectangle(
        [margin - 2, margin - 2, width - margin + 1, body_h - margin + 1],
        radius=width // 16,
        fill=(6, 10, 18, 255),
    )
    screen = rounded_screen(Image.open(shot_path), (screen_w, screen_h), width // 18)
    body.paste(screen, (margin, margin), screen)
    return body


def app_icon(size: int) -> Image.Image:
    """应用图标：蓝底 + 白色图形（桌面观感），裁成圆角方形。

    前景图是**蓝色**图形 + 透明底，直接贴到深色背景上会糊成一团；
    这里统一换成白图形配蓝底，与 App 内的强调色一致。
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=round(size * 0.23), fill=ICON_BLUE
    )

    mark = Image.open(ICON).convert("RGBA")
    # 放大 1.25 倍：前景图自带自适应图标的安全边距，原尺寸图形偏小；
    # 再大就会顶到圆角边缘，看起来像被裁掉
    mark = mark.resize((round(size * 1.25), round(size * 1.25)), Image.LANCZOS)
    white = Image.new("RGBA", mark.size, (255, 255, 255, 255))
    white.putalpha(mark.getchannel("A"))

    offset = ((size - mark.width) // 2, (size - mark.height) // 2)
    canvas.alpha_composite(white, offset)

    # 圆角裁剪，避免图形溢出到圆角外
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=round(size * 0.23), fill=255
    )
    canvas.putalpha(mask)
    return canvas


def shadow(layer: Image.Image, radius: int) -> Image.Image:
    return layer.filter(ImageFilter.GaussianBlur(radius))


def compose_square() -> Image.Image:
    size = (1080, 1080)
    canvas = gradient(size).convert("RGB")
    canvas = Image.composite(glow(size, (760, 620), 420), canvas, Image.new("L", size, 90))

    body = phone(SHOT, 360)

    # 阴影
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    sh.paste((0, 0, 0, 170), (680, 260), body)
    sh = shadow(sh, 30)
    canvas.paste(sh, (0, 0), sh)

    canvas.paste(body, (680, 260), body)

    draw = ImageDraw.Draw(canvas)
    icon = app_icon(100)
    canvas.paste(icon, (80, 196), icon)
    draw.text((202, 206), "DS Echo", font=font(YAHEI_BOLD, 88), fill=TEXT)
    draw.text((84, 330), "长对话，接着聊", font=font(YAHEI_BOLD, 58), fill=ACCENT)

    lines = [
        ("超长上下文", "256K token ≈ 40 万字"),
        ("会记得住", "自动整理记忆，下次打开还记得"),
        ("导入官方记录", "一键并入，不覆盖原有会话"),
        ("数据在手机", "无服务器，Key 只存本机"),
    ]
    y = 470
    for title, sub in lines:
        draw.ellipse([88, y + 12, 108, y + 32], fill=ACCENT)
        draw.text((126, y), title, font=font(YAHEI_BOLD, 34), fill=TEXT)
        draw.text((126, y + 44), sub, font=font(YAHEI, 25), fill=MUTED)
        y += 118

    draw.text((80, 990), "Android 8.0+ · 无订阅 · 需自备 API Key", font=font(YAHEI, 26), fill=MUTED)
    return canvas


def compose_vertical() -> Image.Image:
    size = (1080, 1440)
    canvas = gradient(size).convert("RGB")
    canvas = Image.composite(glow(size, (820, 780), 470), canvas, Image.new("L", size, 95))

    body = phone(SHOT, 440)

    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    sh.paste((0, 0, 0, 175), (600, 300), body)
    sh = shadow(sh, 34)
    canvas.paste(sh, (0, 0), sh)

    canvas.paste(body, (600, 320), body)

    draw = ImageDraw.Draw(canvas)
    icon = app_icon(104)
    canvas.paste(icon, (76, 118), icon)
    draw.text((206, 132), "DS Echo", font=font(YAHEI_BOLD, 80), fill=TEXT)
    draw.text((78, 258), "长对话，接着聊", font=font(YAHEI_BOLD, 50), fill=ACCENT)
    draw.text((78, 330), "官方 App 聊不下去的那些对话，\n在这里可以继续。", font=font(YAHEI, 28), fill=MUTED, spacing=12)

    lines = [
        ("超长上下文", "256K token ≈ 40 万字"),
        ("自动记忆", "下次打开还记得"),
        ("导入官方记录", "合并而不覆盖"),
        ("数据只在本机", "无服务器，Key 加密存储"),
    ]
    y = 470
    for title, sub in lines:
        draw.ellipse([80, y + 10, 98, y + 28], fill=ACCENT)
        draw.text((116, y), title, font=font(YAHEI_BOLD, 30), fill=TEXT)
        draw.text((116, y + 40), sub, font=font(YAHEI, 23), fill=MUTED)
        y += 104

    # 左下补「三步开始」：填掉空白区，同时把使用路径说清楚
    draw.text((76, 900), "三步开始", font=font(YAHEI_BOLD, 26), fill=(200, 214, 235))
    steps = ["官方 App 里导出对话", "选择 ZIP 导入到 DS Echo", "接着上次那句继续聊"]
    y = 952
    for index, step in enumerate(steps, start=1):
        badge = f"{index}"
        draw.ellipse([76, y + 2, 108, y + 34], outline=ACCENT, width=2)
        draw.text((84, y + 6), badge, font=font(YAHEI_BOLD, 18), fill=ACCENT)
        draw.text((124, y + 4), step, font=font(YAHEI, 24), fill=MUTED)
        y += 62

    draw.text((72, 1330), "Android 8.0 及以上 · 无订阅 · 需自备 API Key", font=font(YAHEI, 24), fill=MUTED)
    return canvas


if __name__ == "__main__":
    square = compose_square()
    square.save(OUT / "product-square.png", optimize=True)
    vertical = compose_vertical()
    vertical.save(OUT / "product-vertical.png", optimize=True)
    print("已生成：")
    for name in ("product-square.png", "product-vertical.png"):
        path = OUT / name
        print(f"  {path}  ({path.stat().st_size // 1024} KB)")
