"""流式与「停止生成」的严格验证（真机 WebView）—— 第三版

前两版的教训：
1. 回答太短（30 个数字），800ms 就结束，采样抓不到增长 → 换成长回答。
2. "最后一条助手消息" 会取到上一轮残留的旧回答 → 改用稳定选择器
   `.ds-assistant-message-main-content`（AssistantMessage.tsx:71 的语义类名，非哈希），
   并用"发送前的消息条数"作为基线，只测新增的那一条。
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

# 所有助手消息正文的长度数组
LENGTHS_JS = """() => [...document.querySelectorAll('.ds-assistant-message-main-content')]
    .map(n => (n.innerText || '').length)"""

STOP_JS = """() => {
  const bs = [...document.querySelectorAll('button')]
  const stop = bs.find(b => /停止|Stop/i.test(b.getAttribute('aria-label') || b.innerText || ''))
  return stop ? (stop.getAttribute('aria-label') || stop.innerText || 'stop') : null
}"""

CLICK_STOP_JS = """() => {
  const bs = [...document.querySelectorAll('button')]
  const stop = bs.find(b => /停止|Stop/i.test(b.getAttribute('aria-label') || b.innerText || ''))
  if (!stop) return false
  stop.click()
  return true
}"""


def adb(*a):
    return subprocess.run([ADB, *a], capture_output=True, text=True)


async def main():
    pid = adb("shell", "pidof", PKG).stdout.strip()
    adb("forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}")
    OUT.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        page = next(pg for ctx in browser.contexts for pg in ctx.pages if "localhost" in pg.url)

        close = page.locator('button[aria-label*="关闭"], button[aria-label*="Close"]').first
        if await close.count():
            await close.click()
            await page.wait_for_timeout(400)

        baseline = await page.evaluate(LENGTHS_JS)
        base_count = len(baseline)
        print(f"发送前已有 {base_count} 条助手消息，长度={baseline}")

        ta = page.locator("textarea").first
        await ta.fill("请详细讲解快速排序：原理、分区过程、复杂度、稳定性、三个常见优化，每部分展开，不少于 600 字。")
        await ta.press("Enter")

        def new_len(lengths):
            """本次新增的那条助手消息的长度"""
            return lengths[base_count] if len(lengths) > base_count else None

        timeline, stop_seen_at, clicked_at = [], None, None
        for i in range(70):
            await page.wait_for_timeout(110)
            t = (i + 1) * 110
            lengths = await page.evaluate(LENGTHS_JS)
            current = new_len(lengths)
            stop = await page.evaluate(STOP_JS)
            timeline.append({"t": t, "msg_count": len(lengths), "len": current, "stop": bool(stop)})

            if stop and stop_seen_at is None:
                stop_seen_at = t
                print(f"  停止按钮出现 t={t}ms（当前长度 {current}）")

            # 攒到 200 字以上就点停止，确保确实中断了一段正在生成的回答
            if stop and clicked_at is None and (current or 0) >= 200:
                ok = await page.evaluate(CLICK_STOP_JS)
                clicked_at = t
                print(f"  已在 t={t}ms 点击停止（长度 {current}，点击返回 {ok}）")
                break

            if current is not None and not stop and i > 15:
                print(f"  生成自然结束于 t≈{t}ms（长度 {current}）")
                break

        post = []
        for _ in range(12):
            await page.wait_for_timeout(200)
            lengths = await page.evaluate(LENGTHS_JS)
            post.append(new_len(lengths))
        await page.screenshot(path=OUT / "stream-3-stopped.png")

        lens = [row["len"] for row in timeline if row["len"] is not None]
        increases = sum(1 for a, b in zip(lens, lens[1:]) if b > a)
        distinct = sorted(set(lens))

        report = {
            "baseline_count": base_count,
            "timeline": timeline,
            "increases": increases,
            "distinct_lengths": distinct[:40],
            "stop_seen_at_ms": stop_seen_at,
            "clicked_stop_at_ms": clicked_at,
            "post_stop_lengths": post,
        }
        (OUT / "stream-3.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"\n不同长度取值数={len(distinct)}，递增次数={increases}")
        print("前 12 个长度:", distinct[:12])
        print("停止后采样:", post)

        streaming_ok = increases >= 3
        print(f"\n流式判定：{'✅ 逐块到达' if streaming_ok else '❌ 疑似一次性'}")
        stop_ok = None
        if clicked_at is not None:
            stop_ok = len(set(post)) == 1 and post[0] is not None
            print(f"停止判定：{'✅ 中断成功，长度冻结在 %s' % post[0] if stop_ok else '❌ 点击后仍在增长'}")
        else:
            print("停止判定：⚠️ 未能在生成期间点到停止（未验证）")

        await browser.close()
        return 0 if streaming_ok and stop_ok is not False else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
