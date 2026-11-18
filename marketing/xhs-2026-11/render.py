"""把 cards/*.html 渲染成 out/*.png（1242×1656，3:4，小红书原尺寸）。

为什么用 HTML 而不是 AI 生图：卡片上全是中文小字，AI 生图会写错字、糊字；
HTML 排版 + 浏览器截图能做到"字一个不差、位置可复现"。

用法：
    python marketing/xhs-2026-11/render.py            # 渲染全部
    python marketing/xhs-2026-11/render.py 01         # 只渲染名字含 01 的

浏览器用系统自带的 Edge（channel="msedge"），不额外下载 Chromium。
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
CARDS = ROOT / "cards"
OUT = ROOT / "out"
W, H = 1242, 1656


def main() -> int:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    OUT.mkdir(exist_ok=True)
    pages = sorted(p for p in CARDS.glob("*.html") if not only or only in p.name)
    if not pages:
        print(f"没有匹配的卡片：{only}")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        for src in pages:
            page.goto(src.as_uri())
            page.wait_for_timeout(250)  # 等字体上屏，否则首屏可能用到回退字体
            # 越界检查：内容比画布高就是排版溢出，必须在这里拦下来
            metrics = page.evaluate(
                "() => ({ sh: document.body.scrollHeight, sw: document.body.scrollWidth })"
            )
            dst = OUT / f"{src.stem}.png"
            page.screenshot(path=str(dst))
            flag = ""
            if metrics["sh"] > H or metrics["sw"] > W:
                flag = f"  [溢出 scrollHeight={metrics['sh']} scrollWidth={metrics['sw']}]"
            print(f"{dst.name}  {W}x{H}{flag}")
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
