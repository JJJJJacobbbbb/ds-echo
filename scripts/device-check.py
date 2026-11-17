"""接管真机上 Capacitor WebView（通过 adb forward 出来的 CDP 端口），做可视化验证。

用法：
  python scripts/device-check.py                     # 只探测：截图 + 读正文 + 控制台
  python scripts/device-check.py --shot name.png     # 指定截图名

前置（脚本会自己尝试执行）：
  adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
"""
import argparse
import asyncio
import json
import pathlib
import subprocess
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".verify" / "device"
ADB = r"D:\_tools\android-sdk\platform-tools\adb.exe"
PKG = "com.dsecho.app"


def ensure_forward() -> int:
    out = subprocess.run([ADB, "shell", "pidof", PKG], capture_output=True, text=True)
    pid = out.stdout.strip()
    if not pid:
        print(f"应用没在运行（pidof {PKG} 为空），先 adb shell am start -n {PKG}/.MainActivity")
        return 1
    print(f"app pid = {pid}")
    subprocess.run([ADB, "forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}"], check=True)
    return 0


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shot", default="cdp.png")
    ap.add_argument("--eval", default="", help="在页面里求值的表达式，结果会打印")
    args = ap.parse_args()

    if ensure_forward() != 0:
        return 2
    OUT.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        pages = [pg for ctx in browser.contexts for pg in ctx.pages]
        if not pages:
            print("没有可用的页面")
            return 2
        page = next((pg for pg in pages if "localhost" in pg.url), pages[0])
        print("页面:", page.url)

        logs: list[str] = []
        page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))

        await page.wait_for_timeout(600)
        shot_path = OUT / args.shot
        await page.screenshot(path=shot_path)
        body = await page.evaluate("() => document.body.innerText")
        print("截图:", shot_path)
        print("正文前 300 字:", json.dumps(body[:300], ensure_ascii=False))

        if args.eval:
            value = await page.evaluate(f"() => ({args.eval})")
            print("eval =>", json.dumps(value, ensure_ascii=False))

        if logs:
            print("控制台输出:")
            for line in logs[-20:]:
                print("  ", line)
        else:
            print("控制台：无输出")

        # 不清 browser，避免关掉真实 WebView
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
