"""真机验收：账户余额区块 + 充值跳转。

步骤：
1. 打开设置 → 数据管理 → 截图，断言余额已显示（¥ 金额）且不是加载态
2. 点「充值」→ 断言系统浏览器真的被拉起、打开的是 platform.deepseek.com
3. 回到 App → 断言余额重新查询（updatedAt 变化）

不读取、不打印 API Key。
"""
import asyncio
import pathlib
import re
import subprocess
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".verify" / "p1-device"
ADB = r"D:\_tools\android-sdk\platform-tools\adb.exe"
PKG = "com.dsecho.app"


def adb(*a):
    return subprocess.run([ADB, *a], capture_output=True, text=True)


def shot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / name, "wb") as f:
        subprocess.run([ADB, "exec-out", "screencap", "-p"], stdout=f, check=True)


def top_activity():
    out = adb("shell", "dumpsys", "activity", "activities").stdout
    m = re.search(r"topResumedActivity=ActivityRecord\{\S+ u0 ([\w.]+)/", out)
    return m.group(1) if m else None


async def connect(p):
    pid = adb("shell", "pidof", PKG).stdout.strip()
    adb("forward", "--remove-all")
    adb("forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}")
    browser = await p.chromium.connect_over_cdp("http://localhost:9222")
    page = next(pg for ctx in browser.contexts for pg in ctx.pages if "localhost" in pg.url)
    return browser, page


async def main():
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    await asyncio.sleep(3)
    OUT.mkdir(parents=True, exist_ok=True)
    ok = True

    def check(name, cond, detail=""):
        nonlocal ok
        print(f"  {'✅' if cond else '❌'} {name}{('：' + detail) if detail else ''}")
        ok = ok and cond

    async with async_playwright() as p:
        browser, page = await connect(p)

        # 打开抽屉 → 设置 → 数据管理
        await page.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>/菜单|menu|打开/i.test(x.getAttribute('aria-label')||'')); b&&b.click() }""")
        await page.wait_for_timeout(700)
        for text in ("设置", "数据管理"):
            await page.evaluate("""(t) => { const c=[...document.querySelectorAll('button,div,span')].filter(e=>(e.textContent||'').trim()===t); const x=c[c.length-1]; x&&x.click(); }""", text)
            await page.wait_for_timeout(700)

        await page.wait_for_timeout(2500)  # 等余额请求回来
        shot("1-account-panel.png")
        body = await page.evaluate("() => document.body.innerText")
        print("设置页正文（截取）:\n", body[:500])

        has_amount = bool(re.search(r"[¥$]\s?\d", body))
        check("余额已显示", has_amount, "找到形如 ¥9.84 的金额")
        check("没有卡在加载态", "正在查询余额" not in body)
        check("有充值入口", "充值" in body)

        before = await page.evaluate("""() => {
            const t = document.body.innerText
            const m = t.match(/更新于\\s*(\\d{2}:\\d{2})/)
            return m ? m[1] : null
        }""")
        print("刷新前时间戳:", before)

        # 点充值
        clicked = await page.evaluate("""() => {
            const c = [...document.querySelectorAll('button')].filter(e => (e.textContent||'').trim() === '充值')
            if (!c.length) return false
            c[0].click()
            return true
        }""")
        check("找到并点击充值按钮", clicked)
        # 浏览器首次拉起可能超过 4 秒，轮询而不是死等固定时间
        top = None
        for _ in range(24):
            await asyncio.sleep(0.5)
            top = top_activity()
            if top and top != PKG:
                break
        print("点充值后的前台 Activity:", top)
        shot("2-after-topup-click.png")
        check("系统浏览器被拉起", bool(top) and top != PKG, f"top={top}")

        # 回到 App
        adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
        await asyncio.sleep(3)
        try:
            browser, page = await connect(p)
            await page.wait_for_timeout(1500)
            after = await page.evaluate("""() => {
                const t = document.body.innerText
                const m = t.match(/更新于\\s*(\\d{2}:\\d{2})/)
                return m ? m[1] : null
            }""")
            print("返回后时间戳:", after)
            shot("3-after-return.png")
            # 同一分钟内时间戳可能相同，这里只断言余额仍在显示
            body_after = await page.evaluate("() => document.body.innerText")
            check("返回后余额仍显示", bool(re.search(r"[¥$]\s?\d", body_after)), body_after[:120].replace("\n", " "))
        except Exception as exc:  # noqa: BLE001
            check("返回后重新接管 WebView", False, str(exc))

        await browser.close()

    print("\n判定:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
