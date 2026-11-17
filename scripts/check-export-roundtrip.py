"""导出的 ZIP 能否被重新导入（导出 ↔ 导入 闭环）。

做法：把「App 导出的文件」喂给全新的浏览器上下文，走完整的导入流程，
断言会话数、附件数与导出时一致，且没有控制台错误。

前置：
1. 用 App 导出一次，把文件从设备拉下来：
   adb exec-out run-as com.dsecho.app cat cache/exports/<文件名> > chatdata/exported-by-app.zip
2. pnpm dev 起在 8090

用法： python scripts/check-export-roundtrip.py
"""
import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".verify" / "export-roundtrip"
ZIP = ROOT / "chatdata" / "exported-by-app.zip"
URL = "http://localhost:8090/"

COUNT_JS = """async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('chat-demo')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const count = (name) => new Promise((res) => {
    const q = db.transaction(name).objectStore(name).count()
    q.onsuccess = () => res(q.result)
  })
  const out = { sessions: await count('sessions'), files: await count('files'), registry: await count('importRegistry') }
  db.close()
  return out
}"""


async def main():
    if not ZIP.exists():
        print(f"缺少导出文件：{ZIP}")
        return 2
    OUT.mkdir(parents=True, exist_ok=True)
    ok = True

    def check(name, cond, detail=""):
        nonlocal ok
        print(f"  {'✅' if cond else '❌'} {name}{('：' + detail) if detail else ''}")
        ok = ok and cond

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={"width": 420, "height": 900})).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until="load")
        await page.wait_for_timeout(1200)

        # 首屏是连接向导，从它底部的入口进设置
        await page.get_by_text("已有聊天记录？先导入再连接", exact=True).first.click()
        await page.wait_for_timeout(900)

        async with page.expect_file_chooser() as fc:
            await page.get_by_text("上传", exact=True).first.click()
        await (await fc.value).set_files(str(ZIP))
        await page.wait_for_timeout(1500)

        preview = await page.evaluate("""() => {
            const m = document.body.innerText.match(/将导入\\s*(\\d+)\\s*个会话[，,]\\s*跳过\\s*(\\d+)/)
            return m ? { fresh: +m[1], skipped: +m[2] } : null
        }""")
        print("导入预览:", preview)
        await page.screenshot(path=OUT / "1-preview.png", full_page=True)

        await page.get_by_role("button", name="导入", exact=True).first.click()
        await page.wait_for_timeout(8000)
        counts = await page.evaluate(COUNT_JS)
        print("导入结果:", counts)
        await page.screenshot(path=OUT / "2-imported.png", full_page=True)

        check("预览显示 77 个会话", preview is not None and preview["fresh"] == 77, str(preview))
        check("会话数还原为 77", counts["sessions"] == 77, f"sessions={counts['sessions']}")
        check("附件数还原为 6", counts["files"] == 6, f"files={counts['files']}")
        check("无未捕获异常", not errors, "; ".join(errors[:2]))

        (OUT / "result.json").write_text(
            json.dumps({"preview": preview, "counts": counts, "errors": errors}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        await browser.close()

    print("\n判定:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
