"""真机验收：首次连接向导。

做法：把已经存在的 API Key 从 localStorage 临时移除 → 重载页面 → 截图向导 →
再把 Key 原样写回 → 重载 → 确认回到正常聊天界面。

安全性：
- Key 只在这个进程的内存里短暂停留，不打印、不落盘。
- 用 try/finally 保证即使中途异常也会把 Key 写回去，不会让你的手机处于"未连接"状态。
"""
import asyncio
import pathlib
import subprocess
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".verify" / "p1-device"
ADB = r"D:\_tools\android-sdk\platform-tools\adb.exe"
PKG = "com.dsecho.app"
KEY_STORE = "chat-demo:api-key"


def adb(*a):
    return subprocess.run([ADB, *a], capture_output=True, text=True)


def shot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / name, "wb") as f:
        subprocess.run([ADB, "exec-out", "screencap", "-p"], stdout=f, check=True)


async def connect(p, retries=10):
    """重载页面会让 CDP 目标消失，需要重新建立连接"""
    last = None
    for _ in range(retries):
        try:
            pid = adb("shell", "pidof", PKG).stdout.strip()
            adb("forward", "--remove-all")
            adb("forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}")
            browser = await p.chromium.connect_over_cdp("http://localhost:9222")
            page = next(pg for ctx in browser.contexts for pg in ctx.pages if "localhost" in pg.url)
            await page.wait_for_timeout(800)
            return browser, page
        except Exception as exc:  # noqa: BLE001
            last = exc
            await asyncio.sleep(1)
    raise RuntimeError(f"重连失败：{last}")


async def reload(page):
    """触发重载；CDP 目标会断开，调用方需重新 connect"""
    try:
        await page.evaluate("() => location.reload()")
    except Exception:  # noqa: BLE001 - 目标被销毁属正常
        pass
    await asyncio.sleep(3)


async def main():
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    await asyncio.sleep(3)
    ok = True
    key = None
    removed = False

    def check(name, cond, detail=""):
        nonlocal ok
        print(f"  {'✅' if cond else '❌'} {name}{('：' + detail) if detail else ''}")
        ok = ok and cond

    async with async_playwright() as p:
        browser, page = await connect(p)
        try:
            key = await page.evaluate(f"() => localStorage.getItem('{KEY_STORE}')")
            if not key:
                print("当前没有已保存的 Key，无法做「临时移除再恢复」的验证")
                return 2
            print(f"已读到 Key（长度 {len(key)}，不打印内容）")

            # --- 临时移除并重载，制造"首次安装"状态 ---
            await page.evaluate(f"() => localStorage.removeItem('{KEY_STORE}')")
            removed = True
            await reload(page)
            browser, page = await connect(p)

            body = await page.evaluate("() => document.body.innerText")
            shot("4-guide-device.png")
            print("向导页正文:\n", body[:420])

            check("真机进入的是连接向导", "欢迎使用 DS Echo" in body)
            check("三步说明都在", "在官方平台创建 API Key" in body and "把密钥粘贴到下面" in body and "验证并连接" in body)
            check("有创建密钥按钮", "前往创建密钥" in body)
            check("没有出现设置页内容", "通用设置" not in body and "数据管理" not in body)

            # 顺带验证「前往创建密钥」真的能拉起浏览器
            await page.evaluate("""() => {
                const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === '前往创建密钥')
                b && b.click()
            }""")
            top = None
            for _ in range(24):
                await asyncio.sleep(0.5)
                out = adb("shell", "dumpsys", "activity", "activities").stdout
                import re
                m = re.search(r"topResumedActivity=ActivityRecord\{\S+ u0 ([\w.]+)/", out)
                top = m.group(1) if m else None
                if top and top != PKG:
                    break
            check("前往创建密钥会打开系统浏览器", bool(top) and top != PKG, f"top={top}")
            shot("5-key-page.png")
        finally:
            # --- 无论成功与否，都把 Key 写回去 ---
            if removed and key:
                try:
                    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
                    await asyncio.sleep(2)
                    browser2, page2 = await connect(p)
                    await page2.evaluate(
                        """([k]) => localStorage.setItem('chat-demo:api-key', k)""", [key]
                    )
                    await reload(page2)
                    browser3, page3 = await connect(p)
                    body3 = await page3.evaluate("() => document.body.innerText")
                    restored_key = await page3.evaluate(f"() => localStorage.getItem('{KEY_STORE}')")
                    check("Key 已恢复", restored_key == key)
                    check("恢复后回到聊天界面", "开启新对话" in body3 or "今天有什么可以帮到你" in body3)
                    shot("6-restored.png")
                except Exception as exc:  # noqa: BLE001
                    check("Key 恢复", False, f"恢复失败，需要你在 App 里重新粘贴 Key：{exc}")
        await browser.close()

    print("\n判定:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
