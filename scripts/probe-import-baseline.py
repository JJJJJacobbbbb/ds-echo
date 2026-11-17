"""基线验证：用用户的真实导出 ZIP，跑一遍上游**现有**导入逻辑，记录改造前行为。

只读性质：不修改 src/，不改用户数据。Playwright 使用临时浏览器 profile，
IndexedDB 只存在于该临时 profile 中，跑完即随进程销毁。

用法： python .verify/import-baseline.py
输出： .verify/import-baseline/*.png 与判定结果
"""
import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZIP = ROOT / "chatdata" / "deepseek_data-2026-11-17.zip"
OUT = ROOT / ".verify" / "import-baseline"
URL = "http://localhost:8090/"

DB_COUNT_JS = """
async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('chat-demo')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const count = (name) => new Promise((res) => {
    if (!db.objectStoreNames.contains(name)) return res(null)
    const req = db.transaction(name).objectStore(name).count()
    req.onsuccess = () => res(req.result)
    req.onerror = () => res('err')
  })
  const out = {}
  for (const n of ['sessions', 'sessionSummaries', 'files', 'sessionsStaging', 'filesStaging']) {
    out[n] = await count(n)
  }
  db.close()
  return out
}
"""


async def main() -> int:
    if not ZIP.exists():
        print(f"缺少样本 ZIP: {ZIP}")
        return 2
    OUT.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={"width": 420, "height": 900})
        page = await context.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(URL, wait_until="load")
        await page.wait_for_timeout(1500)

        before = await page.evaluate(DB_COUNT_JS)
        print("导入前 DB 计数:", before)

        # 打开「数据管理」页签（首屏默认就在这一页，但显式点一次防布局变化）
        for label in ("数据管理", "Data management"):
            tab = page.get_by_text(label, exact=True)
            if await tab.count():
                await tab.first.click()
                break
        await page.wait_for_timeout(300)

        # 选文件：点「上传」触发系统文件选择器，再用 Playwright 的标准 file chooser 接口喂文件。
        # （不能直接对隐藏 input 调 set_input_files：该 input 是点按钮时才被创建的）
        upload = page.get_by_text("上传", exact=True)
        if await upload.count() == 0:
            print("FAIL: 找不到「上传」按钮")
            await page.screenshot(path=OUT / "no-upload-button.png", full_page=True)
            await browser.close()
            return 1
        async with page.expect_file_chooser() as fc_info:
            await upload.first.click()
        chooser = await fc_info.value
        await chooser.set_files(str(ZIP))
        await page.wait_for_timeout(800)
        await page.screenshot(path=OUT / "1-file-selected.png", full_page=True)

        # 确认弹窗：标题「确认导入历史对话？」
        confirm_title = page.get_by_text("确认导入历史对话？", exact=False)
        if await confirm_title.count():
            print("看到确认弹窗（与代码一致：导入=覆盖）")
            await page.screenshot(path=OUT / "2-confirm-dialog.png", full_page=True)
            btn = page.get_by_text("确认导入", exact=True)
            if await btn.count():
                await btn.first.click()
            else:
                failures.append("确认弹窗里没找到「确认导入」按钮")
                await page.screenshot(path=OUT / "2b-no-confirm-button.png", full_page=True)
        else:
            failures.append("选完文件后没有出现确认弹窗")

        # 等待导入完成（状态文案「已导入 N 个对话」）
        try:
            await page.wait_for_function(
                """() => /已导入\\s*\\d+\\s*个对话/.test(document.body.innerText)""",
                timeout=120_000,
            )
        except Exception as exc:  # noqa: BLE001 - 需要把失败原因带出来
            failures.append(f"等待导入完成超时: {exc}")

        await page.wait_for_timeout(2000)
        after = await page.evaluate(DB_COUNT_JS)
        print("导入后 DB 计数:", after)
        await page.screenshot(path=OUT / "3-imported.png", full_page=True)

        # 关闭设置，看会话列表是否出现
        close = page.locator('[aria-label="关闭"], [aria-label="Close"]')
        if await close.count():
            await close.first.click()
        await page.wait_for_timeout(800)
        body_text = await page.evaluate("() => document.body.innerText")
        await page.screenshot(path=OUT / "4-session-list.png", full_page=True)

        await browser.close()

    summary = {
        "before": before,
        "after": after,
        "console_errors": errors,
        "failures": failures,
        "page_text_head": body_text[:600],
    }
    (OUT / "result.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("console_errors", "failures")}, ensure_ascii=False, indent=2))

    # 判定：会话数应等于 ZIP 里的 77，且没有控制台错误
    ok = True
    if after.get("sessions") != 77:
        failures.append(f"导入后 sessions={after.get('sessions')}，期望 77")
        ok = False
    if after.get("files") != 6:
        failures.append(f"导入后 files={after.get('files')}，期望 6（附件数）")
        ok = False
    if errors:
        ok = False
    print("判定:", "PASS" if ok and not failures else "FAIL")
    for f in failures:
        print("  -", f)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
