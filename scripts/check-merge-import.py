"""P2 端到端验收：合并导入的四个验收场景。

为什么在浏览器里跑而不是真机：
Android 的系统文件选择器是原生对话框，Playwright 无法直接选文件；
而合并逻辑（校验 → 暂存 → 预览 → 单事务合并 → 去重）完全跑在页面里，
在浏览器跑与在 WebView 跑是同一份代码、同一个 IndexedDB 实现。
真机上额外验证的是"文件选择器能选到文件"，那属于上游已有能力。

场景（对应计划书 P2 验收条款）：
1. 导入真实归档 77 个会话 → 全部导入
2. 导入"只含 1 个新会话"的归档 → 合并进 1 个（不是替换）
3. 再次导入真实归档 → 0 个导入、77 个跳过，且上一步那个新会话仍在（不丢数据）
4. 导入损坏 ZIP → 报错，会话数不变

用法： python scripts/check-merge-import.py   （需先 pnpm dev 起在 8090）
"""
import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".verify" / "merge-import"
REAL = ROOT / "chatdata" / "deepseek_data-2026-11-17.zip"
ONE = ROOT / "chatdata" / "test-merge-one.zip"
CORRUPT = ROOT / "chatdata" / "test-corrupt.zip"
URL = "http://localhost:8090/"

COUNT_JS = """async () => {
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
  for (const n of ['sessions', 'sessionSummaries', 'files', 'importRegistry']) {
    out[n] = await count(n)
  }
  db.close()
  return out
}"""


async def open_settings_data(page):
    """打开设置并切到「数据管理」。

    首次安装（没有 API Key）时首屏是连接向导、没有侧栏，只能走向导底部的
    「已有聊天记录？先导入再连接」入口；有 Key 时才从侧栏进。
    """
    guide_link = page.get_by_text("已有聊天记录？先导入再连接", exact=True)
    if await guide_link.count():
        await guide_link.first.click()
        await page.wait_for_timeout(900)
        return
    await page.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>/菜单|menu|打开/i.test(x.getAttribute('aria-label')||'')); b&&b.click() }""")
    await page.wait_for_timeout(600)
    for text in ("设置", "数据管理"):
        await page.evaluate("""(t) => { const c=[...document.querySelectorAll('button,div,span')].filter(e=>(e.textContent||'').trim()===t); const x=c[c.length-1]; x&&x.click(); }""", text)
        await page.wait_for_timeout(600)


async def close_settings(page):
    closed = await page.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>/关闭|Close/i.test(x.getAttribute('aria-label')||'')); if (!b) return false; b.click(); return true }""")
    await page.wait_for_timeout(700)
    return closed


async def pick_file(page, path):
    """点「上传」触发文件选择器，把文件喂进去"""
    upload = page.get_by_text("上传", exact=True)
    async with page.expect_file_chooser() as fc:
        await upload.first.click()
    chooser = await fc.value
    await chooser.set_files(str(path))


async def read_preview(page):
    """读预览弹窗里的统计文字"""
    return await page.evaluate("""() => {
        const t = document.body.innerText
        const m = t.match(/将导入\\s*(\\d+)\\s*个会话[，,]\\s*跳过\\s*(\\d+)/)
        if (m) return { fresh: +m[1], skipped: +m[2] }
        const n = t.match(/这份归档里的\\s*(\\d+)\\s*个会话本地都已存在/)
        if (n) return { fresh: 0, skipped: +n[1] }
        return null
    }""")


async def confirm_import(page):
    btn = page.get_by_role("button", name="导入", exact=True)
    await btn.first.click()


async def import_once(page, path, shot_name):
    await close_settings(page)
    await open_settings_data(page)
    await pick_file(page, path)
    await page.wait_for_timeout(1200)
    preview = await read_preview(page)
    await page.screenshot(path=OUT / shot_name, full_page=True)
    return preview


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ok = True

    def check(name, cond, detail=""):
        nonlocal ok
        print(f"  {'✅' if cond else '❌'} {name}{('：' + detail) if detail else ''}")
        ok = ok and cond

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 420, "height": 900}, accept_downloads=True)
        page = await ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(URL, wait_until="load")
        await page.wait_for_timeout(1500)

        # --- 场景 1：导入真实归档 ---
        preview = await import_once(page, REAL, "1-preview-real.png")
        print("场景1 预览:", preview)
        check("预览显示 77 个新会话、0 跳过", preview == {"fresh": 77, "skipped": 0}, str(preview))
        await confirm_import(page)
        await page.wait_for_timeout(6000)
        c1 = await page.evaluate(COUNT_JS)
        print("场景1 之后:", c1)
        check("真实归档全部导入", c1["sessions"] == 77, f"sessions={c1['sessions']}")
        check("注册表记录了 77 条", c1["importRegistry"] == 77, f"registry={c1['importRegistry']}")

        # --- 场景 2：导入只含 1 个新会话的归档 ---
        preview2 = await import_once(page, ONE, "2-preview-one.png")
        print("场景2 预览:", preview2)
        # 合成归档里只有 1 个会话，本地没有同 ID 的，所以跳过数就是 0
        check("预览显示 1 个新会话、0 跳过", preview2 == {"fresh": 1, "skipped": 0}, str(preview2))
        await confirm_import(page)
        await page.wait_for_timeout(4000)
        c2 = await page.evaluate(COUNT_JS)
        print("场景2 之后:", c2)
        check("合并后为 78（不是替换成 1）", c2["sessions"] == 78, f"sessions={c2['sessions']}")

        # --- 场景 3：再次导入真实归档（重复导入） ---
        preview3 = await import_once(page, REAL, "3-preview-repeat.png")
        print("场景3 预览:", preview3)
        check("重复导入时预览显示 0 新、77 跳过", preview3 == {"fresh": 0, "skipped": 77}, str(preview3))
        # 没有新会话时确认按钮应禁用
        disabled = await page.get_by_role("button", name="导入", exact=True).first.is_disabled()
        check("没有新会话时「导入」按钮禁用", disabled, f"disabled={disabled}")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(800)
        c3 = await page.evaluate(COUNT_JS)
        print("场景3 之后:", c3)
        check("重复导入不产生重复，且合成会话仍在", c3["sessions"] == 78, f"sessions={c3['sessions']}")

        # --- 场景 4：损坏 ZIP ---
        await close_settings(page)
        await open_settings_data(page)
        await pick_file(page, CORRUPT)
        await page.wait_for_timeout(2500)
        body = await page.evaluate("() => document.body.innerText")
        await page.screenshot(path=OUT / "4-corrupt.png", full_page=True)
        c4 = await page.evaluate(COUNT_JS)
        print("场景4 之后:", c4)
        check("损坏文件给出失败提示", "导入失败" in body or "无法识别" in body, body[:80].replace("\n", " "))
        check("损坏文件不改变现有数据", c4["sessions"] == 78, f"sessions={c4['sessions']}")
        check("无未捕获异常", not errors, "; ".join(errors[:2]))

        (OUT / "result.json").write_text(
            json.dumps({"c1": c1, "c2": c2, "c3": c3, "c4": c4, "errors": errors}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        await browser.close()

    print("\n判定:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))


