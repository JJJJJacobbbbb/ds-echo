"""生成《DS Echo 安装与配置一页纸》PDF。

流程：page.html 里有两个占位符 {{LOGO}}、{{QR}} → 换成 base64 图 → Edge 打印成 A4 PDF
→ 自检（必须正好 1 页、蓝奏云链接必须是可点的 /Link 注释）→ 顺便导出一张预览 PNG 方便肉眼核对。

用法：
    python marketing/xhs-2026-11/pdf/make-pdf.py

为什么不用 reportlab 直接画：这份东西是"排版活儿"（卡片、表格、二维码、圆角），
HTML+浏览器打印做出来的效果和截图一致，而且链接会保留成真正的 PDF 注释。reportlab
要把这些手工画一遍，改动成本高。注意 reportlab 的中文字体配置也是一大坨，HTML 这边
系统里已有 Noto Sans SC，直接就能用。
"""
from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

import qrcode
from PIL import Image
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

HERE = Path(__file__).parent
CARD_ASSETS = HERE.parent / "cards" / "assets"
OUT_PDF = HERE / "DS-Echo-安装配置一页纸.pdf"
PREVIEW = HERE / "预览.png"
LANZOU = "https://wwbld.lanzouw.com/ipX3B4gltyaf"
LANZOU_CODE = "fjq0"


def data_uri(raw: bytes, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


def make_qr(url: str) -> bytes:
    """生成二维码并加上白边，保证打印/缩放后仍能被识别。"""
    qr = qrcode.QRCode(box_size=10, border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#16161a", back_color="white").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def build_html() -> str:
    html = (HERE / "page.html").read_text(encoding="utf-8")
    logo = (CARD_ASSETS / "app-icon-round.png").read_bytes()
    html = html.replace("{{LOGO}}", data_uri(logo, "image/png"))
    html = html.replace("{{QR}}", data_uri(make_qr(LANZOU), "image/png"))
    return html


def check(pdf: Path) -> list[str]:
    """硬性验收：1 页 + 蓝奏云链接可点 + 正文里关键词都在。"""
    reader = PdfReader(str(pdf))
    problems: list[str] = []

    if len(reader.pages) != 1:
        problems.append(f"页数不是 1，而是 {len(reader.pages)} —— 内容超了，要压")

    page = reader.pages[0]
    text = page.extract_text() or ""
    for need in ["提取码", LANZOU_CODE, "API keys", "导入历史对话", "platform.deepseek.com"]:
        if need not in text:
            problems.append(f"正文里找不到「{need}」")

    uris: list[str] = []
    for annot in page.get("/Annots") or []:
        obj = annot.get_object()
        uri = obj.get("/A", {}).get("/URI") if obj.get("/A") else None
        if uri:
            uris.append(str(uri))
    if LANZOU not in uris:
        problems.append(f"蓝奏云链接没做成可点注释，现有链接：{uris}")
    return problems


def main() -> int:
    (HERE / "render.html").write_text(build_html(), encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page()
        page.goto((HERE / "render.html").as_uri())
        page.wait_for_timeout(400)
        page.pdf(
            path=str(OUT_PDF),
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
        )
        browser.close()

    # 预览图：把 PDF 第一页渲染成 PNG，用于肉眼核对（PDF 里的坑只有渲染出来才看得见）
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(OUT_PDF))
    pdf[0].render(scale=2.2).to_pil().save(PREVIEW)

    problems = check(OUT_PDF)
    size_kb = round(OUT_PDF.stat().st_size / 1024)
    print(f"PDF: {OUT_PDF.name}  {size_kb} KB")
    print(f"预览: {PREVIEW.name}")
    if problems:
        for item in problems:
            print(f"  [失败] {item}")
        return 1
    print("自检通过：1 页 · 链接可点 · 关键信息齐全")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
