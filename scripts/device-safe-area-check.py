"""真机安全区验收：主界面 / 抽屉 / 设置弹窗 / 键盘 四种状态都不能压系统栏。

为什么用 adb 截图而不是 Playwright 截图：
Playwright 只截 WebView 页面内容（不含状态栏与导航栏），
而这一轮的验收目标恰恰是"内容有没有压到系统栏上"，必须用全屏截图。

用法： python scripts/device-safe-area-check.py
输出： .verify/device/safe-*.png
"""
import asyncio
import pathlib
import subprocess
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".verify" / "device"
ADB = r"D:\_tools\android-sdk\platform-tools\adb.exe"
PKG = "com.dsecho.app"

# 状态栏/导航栏高度（px），本机实测；用于断言内容没有压进系统栏
STATUS_BAR_PX = 126
NAV_BAR_PX = 2800 - 63


def adb(*a):
    return subprocess.run([ADB, *a], capture_output=True)


def full_screenshot(name: str):
    """用 adb 全屏截图（含系统栏）。必须走二进制重定向，不能让 PowerShell 处理。"""
    path = OUT / name
    with open(path, "wb") as f:
        subprocess.run([ADB, "exec-out", "screencap", "-p"], stdout=f, check=True)
    return path


async def main():
    # 保证应用在前台：前面的步骤可能按过 BACK 把 Activity 退掉，此时 CDP 端口也是死的
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    await asyncio.sleep(3)
    pid = adb("shell", "pidof", PKG).stdout.decode().strip()
    if not pid:
        print("应用没在运行")
        return 2
    # 必须先清掉旧转发：应用重启后 pid 变了，旧转发指向已销毁的 socket，
    # 会表现为 connect_over_cdp 超时（踩过）。
    adb("forward", "--remove-all")
    adb("forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}")
    OUT.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        page = next(pg for ctx in browser.contexts for pg in ctx.pages if "localhost" in pg.url)

        async def metrics(label):
            m = await page.evaluate("""() => {
                const q = (sel) => document.querySelector(sel)
                const rect = (el) => el ? Math.round(el.getBoundingClientRect().top) : null
                const frame = q('[class*="frame"]')
                // 注意：不能用 [class*="drawer"]，会先匹配到 .drawerMask（inset:0，top 恒为 0）
                const drawer = [...document.querySelectorAll('[class*="drawer"]')]
                  .find(e => !e.className.includes('Mask'))
                const overlay = q('[class*="overlay"]')
                const content = q('[class*="content"]')
                const ta = q('textarea')
                return {
                    safeTop: getComputedStyle(document.documentElement).getPropertyValue('--dsecho-safe-top').trim(),
                    safeBottom: getComputedStyle(document.documentElement).getPropertyValue('--dsecho-safe-bottom').trim(),
                    frameTop: rect(frame),
                    framePaddingTop: frame ? getComputedStyle(frame).paddingTop : null,
                    drawerTop: rect(drawer),
                    drawerHeight: drawer ? Math.round(drawer.getBoundingClientRect().height) : null,
                    overlayTop: rect(overlay),
                    dialogTop: overlay && content ? Math.round(content.getBoundingClientRect().top) : null,
                    textareaBottom: ta ? Math.round(ta.getBoundingClientRect().bottom) : null,
                    focused: document.activeElement ? document.activeElement.tagName : null,
                    innerHeight: window.innerHeight
                }
            }""")
            print(f"[{label}] {m}")
            return m

        results = {}
        # 注意：不要在根界面按 BACK —— 会直接退出 Activity，CDP 目标随之关闭。
        # 需要收起抽屉/弹窗时一律用页面内点击。

        # 1) 主界面
        await metrics("主界面")
        full_screenshot("safe-1-main.png")

        # 2) 抽屉
        await page.evaluate("""() => {
            const b = [...document.querySelectorAll('button')]
              .find(x => /菜单|menu|打开/i.test(x.getAttribute('aria-label') || ''))
            b && b.click()
        }""")
        await page.wait_for_timeout(800)
        results["drawer"] = await metrics("抽屉")
        full_screenshot("safe-2-drawer.png")

        # 3) 设置弹窗
        await page.evaluate("""() => {
            const els = [...document.querySelectorAll('button, div, span')]
              .filter(e => (e.textContent || '').trim() === '设置')
            const t = els[els.length - 1]
            t && t.click()
        }""")
        await page.wait_for_timeout(900)
        results["dialog"] = await metrics("设置弹窗")
        full_screenshot("safe-3-dialog.png")

        # 关弹窗
        await page.evaluate("""() => {
            const b = [...document.querySelectorAll('button')]
              .find(x => /关闭|Close/i.test(x.getAttribute('aria-label') || ''))
            b && b.click()
        }""")
        await page.wait_for_timeout(600)

        # 抽屉可能还开着：点遮罩关掉，否则后面的点击会被 drawerMask 吃掉
        drawer_open = await page.evaluate("""() => {
            const mask = document.querySelector('[class*="drawerMask"]')
            if (!mask) return false
            mask.click()
            return true
        }""")
        print("关闭抽屉遮罩:", drawer_open)
        await page.wait_for_timeout(700)

        # 4) 键盘：用 adb 真实点击输入框（CDP 的 click 不会唤起软键盘）
        box = await page.evaluate("""() => {
            const ta = document.querySelector('textarea')
            if (!ta) return null
            const r = ta.getBoundingClientRect()
            const dpr = window.devicePixelRatio
            return { x: Math.round((r.left + r.width / 2) * dpr), y: Math.round((r.top + r.height / 2) * dpr) }
        }""")
        print("点击输入框坐标:", box)
        if box:
            adb("shell", "input", "tap", str(box["x"]), str(box["y"]))
            await page.wait_for_timeout(1800)
            results["keyboard"] = await metrics("键盘弹出")
            full_screenshot("safe-4-keyboard.png")
            # 收键盘不要用 BACK：键盘没起来时 BACK 会直接退出 Activity，CDP 目标就没了。
            # 点一下页面顶部空白处让输入框失焦即可。
            adb("shell", "input", "tap", "630", "300")
            await page.wait_for_timeout(800)

        print("\n=== 断言 ===")
        ok = True

        def check(name, cond, detail):
            nonlocal ok
            print(f"  {'✅' if cond else '❌'} {name}：{detail}")
            ok = ok and cond

        check("安全区变量已注入", results.get("drawer", {}).get("safeTop") == "36px",
              f"top={results.get('drawer', {}).get('safeTop')} bottom={results.get('drawer', {}).get('safeBottom')}")
        drawer_top = results.get("drawer", {}).get("drawerTop")
        # 36 CSS px * dpr 3.5 = 126 px 状态栏
        check("抽屉不压状态栏", drawer_top == 36, f"drawerTop={drawer_top} CSS px（需 = 36）")
        check("抽屉不压导航栏", results.get("drawer", {}).get("drawerHeight") == 746,
              f"高度={results.get('drawer', {}).get('drawerHeight')} CSS px（需 = 800-36-18=746）")
        dialog_top = results.get("dialog", {}).get("dialogTop")
        check("弹窗不压状态栏", dialog_top is not None and dialog_top >= 36,
              f"dialogTop={dialog_top} CSS px（需 >= 36）")
        kb = results.get("keyboard")
        if kb:
            check("点输入框后焦点在输入框", kb.get("focused") == "TEXTAREA", f"activeElement={kb.get('focused')}")

        await browser.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
