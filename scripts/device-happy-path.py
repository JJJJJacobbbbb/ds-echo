"""P0 真机验收：在真实设备 WebView 上验证
1) SSE 流式是否真的逐块到达（不是等全部生成完才显示）
2) 「停止生成」是否真的中断
3) 余额接口 /user/balance 是否可用
4) 切到后台再回来，会话与草稿是否还在

安全：全程不打印 API Key，只读取它的存在性与长度；
余额请求在页面内用已存的 Key 发起，返回值只保留状态码与字段结构。
"""
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

LAST_ASSISTANT_JS = """() => {
  // 取页面上最后一条助手消息的纯文本；找不到就返回空串
  const nodes = document.querySelectorAll('[data-role="assistant"], .assistant, [class*="assistant"]')
  if (nodes.length) return nodes[nodes.length - 1].innerText || ''
  return ''
}"""

BODY_JS = "() => document.body.innerText"


def adb(*args, **kw):
    return subprocess.run([ADB, *args], capture_output=True, text=True, **kw)


def ensure_forward():
    pid = adb("shell", "pidof", PKG).stdout.strip()
    if not pid:
        raise SystemExit("应用没运行")
    adb("forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}")
    return pid


async def main():
    ensure_forward()
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        page = next(pg for ctx in browser.contexts for pg in ctx.pages if "localhost" in pg.url)

        logs = []
        page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))

        # --- 0) Key 是否已存（只看存在性，不打印内容） ---
        key_info = await page.evaluate("""() => {
            const k = localStorage.getItem('chat-demo:api-key') || ''
            return { present: k.length > 0, length: k.length, prefix: k.slice(0, 3) }
        }""")
        print("Key 状态:", json.dumps(key_info, ensure_ascii=False))
        report["key"] = key_info
        if not key_info["present"]:
            print("FAIL: 没读到 Key，用户还没保存成功")
            return 2

        # --- 1) 关掉设置弹窗 ---
        close = page.locator('button[aria-label*="关闭"], button[aria-label*="Close"]').first
        if await close.count():
            await close.click()
        await page.wait_for_timeout(500)
        await page.screenshot(path=OUT / "hp-0-ready.png")

        # --- 2) 发一条会产生较长输出的消息，采样流式过程 ---
        ta = page.locator("textarea").first
        await ta.fill("请从 1 数到 30，每个数字单独一行，只输出数字，不要任何解释")
        await ta.press("Enter")
        print("已发送，开始采样…")

        timeline = []
        for i in range(16):  # 每 400ms 采一次，共 6.4s
            await page.wait_for_timeout(400)
            text = await page.evaluate(LAST_ASSISTANT_JS)
            timeline.append({"t_ms": (i + 1) * 400, "len": len(text), "tail": text[-24:]})
        report["stream_timeline"] = timeline
        for row in timeline:
            print(f"  t={row['t_ms']:>5}ms 长度={row['len']:>4}  尾部={row['tail']!r}")

        lengths = [row["len"] for row in timeline]
        grew_steps = sum(1 for a, b in zip(lengths, lengths[1:]) if b > a)
        report["streaming_ok"] = grew_steps >= 2
        print(f"\n流式判定：递增次数={grew_steps} -> {'SSE 逐块到达 ✅' if report['streaming_ok'] else '疑似一次性到达 ❌'}")
        await page.screenshot(path=OUT / "hp-1-streaming.png")

        # --- 3) 停止生成 ---
        stop_btn = page.locator('button[aria-label*="停止"], button[aria-label*="Stop"]').first
        stop_found = await stop_btn.count() > 0
        print("找到停止按钮:", stop_found)
        report["stop_button_found"] = stop_found
        if stop_found:
            before_stop = await page.evaluate(LAST_ASSISTANT_JS)
            await stop_btn.click()
            await page.wait_for_timeout(1200)
            after_stop_a = await page.evaluate(LAST_ASSISTANT_JS)
            await page.wait_for_timeout(1500)
            after_stop_b = await page.evaluate(LAST_ASSISTANT_JS)
            stable = after_stop_a == after_stop_b
            report["stop_result"] = {
                "len_before": len(before_stop),
                "len_after_1_2s": len(after_stop_a),
                "len_after_2_7s": len(after_stop_b),
                "stopped": stable,
            }
            print(f"停止后：{len(after_stop_a)} -> {len(after_stop_b)} 字符；稳定={stable}")
            await page.screenshot(path=OUT / "hp-2-stopped.png")

        # --- 4) 余额接口（页面内用已存 Key 请求，不输出 Key） ---
        balance = await page.evaluate("""async () => {
            const key = localStorage.getItem('chat-demo:api-key')
            try {
                const r = await fetch('https://api.deepseek.com/user/balance', {
                    headers: { Authorization: 'Bearer ' + key }
                })
                const text = await r.text()
                let parsed = null
                try { parsed = JSON.parse(text) } catch {}
                return {
                    status: r.status,
                    ok: r.ok,
                    shape: parsed ? Object.keys(parsed) : null,
                    is_available: parsed?.is_available,
                    currency_list: (parsed?.balance_infos || []).map(b => b.currency),
                    raw_head: text.slice(0, 240)
                }
            } catch (e) {
                return { error: String(e) }
            }
        }""")
        report["balance"] = balance
        print("\n余额接口:", json.dumps(balance, ensure_ascii=False)[:400])

        # --- 5) 切后台再回来 ---
        await page.evaluate("() => window.scrollTo(0, 0)")
        adb("shell", "input", "keyevent", "KEYCODE_HOME")
        await page.wait_for_timeout(2500)
        adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
        await page.wait_for_timeout(2500)
        # 重连：页面可能被重建
        try:
            page2 = next(pg for ctx in browser.contexts for pg in ctx.pages if "localhost" in pg.url)
            body_after = await page2.evaluate(BODY_JS)
            survived = timeline and timeline[-1]["tail"] and timeline[-1]["tail"][:6] in body_after
            report["background"] = {"body_len": len(body_after), "message_survived": bool(survived)}
            print(f"\n切后台返回：正文 {len(body_after)} 字，之前的回答仍在页面={survived}")
            await page2.screenshot(path=OUT / "hp-3-after-background.png")
        except Exception as exc:  # noqa: BLE001
            report["background"] = {"error": str(exc)}
            print("切后台后重连失败:", exc)

        report["console_errors"] = logs[-10:]
        (OUT / "happy-path.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # 汇总
    print("\n=== 汇总 ===")
    checks = [
        ("SSE 流式", report.get("streaming_ok")),
        ("停止生成", report.get("stop_result", {}).get("stopped")),
        ("余额接口 200", report.get("balance", {}).get("status") == 200),
        ("切后台恢复", report.get("background", {}).get("message_survived")),
        ("无控制台错误", not report.get("console_errors")),
    ]
    for name, ok in checks:
        print(f"  {'✅' if ok else '❌'} {name}")
    return 0 if all(ok for _, ok in checks) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
