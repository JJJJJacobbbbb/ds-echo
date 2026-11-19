"""生成静态下载页（docs/download.html）里的链接与二维码。

用途：应用只发布在 GitHub 上，国内网络经常打不开。这个脚本把多个下载地址
（蓝奏云、Gitee、OSS 等）和对应二维码写进一个**零依赖单文件页面**，
用户把下载页放到任何能访问的地方即可。

用法：
    python scripts/build-download-page.py

改动下载源：编辑下面的 MIRRORS，然后重新运行本脚本。
"""
import base64
import pathlib

import segno

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "docs" / "download.html"
QR_DIR = ROOT / "docs" / "download-qr"

# 下载源：name 显示名，url 地址，primary 是否标记「推荐」，hint 一行说明
# 没填 url 的条目会被跳过——这样可以在拿到真实链接前先占位。
MIRRORS = [
    {
        "name": "GitHub Releases",
        "url": "https://github.com/JJJJJacobbbbb/ds-echo/releases/latest",
        "primary": False,
        "hint": "海外网络；文件最全",
    },
    {
        "name": "蓝奏云",
        "url": "https://wwbld.lanzouw.com/ipX3B4gltyaf",
        "primary": True,
        "hint": "国内免客户端；提取码 fjq0",
    },
    {
        "name": "Gitee Releases",
        "url": "",  # TODO: 建 Gitee 镜像仓库并上传
        "primary": False,
        "hint": "国内代码托管，需实名",
    },
]


# 中文名 → 英文 slug：二维码文件名保持 ASCII，避免 URL 编码麻烦
SLUGS = {"蓝奏云": "lanzou", "阿里云": "aliyun", "腾讯云": "tencent"}


def qr_for(name: str, url: str) -> str:
    """生成二维码 PNG，返回相对页面路径；用 SVG 数据内联也可以，这里用 PNG 更通用"""
    QR_DIR.mkdir(parents=True, exist_ok=True)
    slug = SLUGS.get(name) or "".join(
        ch if ch.isascii() and ch.isalnum() else "-" for ch in name.lower()
    ).strip("-") or "download"
    target = QR_DIR / f"{slug}.png"
    segno.make(url, error="m").save(target, scale=6, border=2, dark="#1c2128", light="#ffffff")
    return f"download-qr/{target.name}"


def to_js(entries: list[dict]) -> str:
    lines = []
    for item in entries:
        fields = [f'name: {item["name"]!r}'.replace("'", '"')]
        fields.append(f'url: {item["url"]!r}'.replace("'", '"'))
        if item.get("primary"):
            fields.append("primary: true")
        if item.get("qr"):
            fields.append(f'qr: {item["qr"]!r}'.replace("'", '"'))
        if item.get("hint"):
            fields.append(f'hint: {item["hint"]!r}'.replace("'", '"'))
        lines.append("    { " + ", ".join(fields) + " },")
    return "\n".join(lines)


def main() -> None:
    entries = []
    for item in MIRRORS:
        if not item["url"]:
            continue
        entry = dict(item)
        entry["qr"] = qr_for(item["name"], item["url"])
        entries.append(entry)

    html = PAGE.read_text(encoding="utf-8")
    start = "    /*__LINKS_START__*/"
    end = "    /*__LINKS_END__*/"
    if start not in html or end not in html:
        raise SystemExit("download.html 里找不到 /*__LINKS_START__*/ 与 /*__LINKS_END__*/ 标记")
    body = to_js(entries) if entries else "    /* 还没有可用下载源：编辑 scripts/build-download-page.py 的 MIRRORS */"
    head, rest = html.split(start, 1)
    _, tail = rest.split(end, 1)
    html = head + start + "\n" + body + "\n" + end + tail
    PAGE.write_text(html, encoding="utf-8")
    print(f"已写入 {len(entries)} 个下载源，二维码在 {QR_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
