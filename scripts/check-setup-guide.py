"""浏览器端验证首次连接向导（全新 profile = 首次安装的状态）。

覆盖：
1. 未连接时进的是向导，不是设置对话框
2. 三步结构齐全、隐私说明存在
3. 假 Key -> 明确报「API Key 无效」，且不会保存到 localStorage
4. 页面无控制台错误

用法： python scripts/check-setup-guide.py   （需先 pnpm dev 起在 8090）
"""
import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".verify" / "setup-guide"
URL = "http://localhost:8090/"


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ok = True
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 420, "height": 900})
        page = await ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(URL, wait_until="load")
        await page.wait_for_timeout(1500)

        body = await page.evaluate("() => document.body.innerText")
        print("页面正文:\n", body[:400])
        await page.screenshot(path=OUT / "1-guide.png", full_page=True)

        def check(name, cond, detail=""):
            nonlocal ok
            print(f"  {'✅' if cond else '❌'} {name}{('：' + detail) if detail else ''}")
            ok = ok and cond

        print("\n=== 断言 ===")
        check("进入的是向导而非设置对话框", "欢迎使用 DS Echo" in body, "标题存在")
        check("三步都在", all(f"{i}" in body for i in (1, 2, 3)) and "验证并连接" in body)
        check("有前往创建密钥入口", "前往创建密钥" in body)
        check("有隐私说明", "只保存在这台手机上" in body)
        check("没有暴露开发者参数", "base url" not in body.lower() and "模型名" not in body)
        check("没有打开设置对话框", "通用设置" not in body)

        # 假 Key 走一遍错误路径
        await page.locator("input[type=password]").fill("sk-dsecho-invalid-key-for-test")
        await page.get_by_role("button", name="验证并连接").click()
        await page.wait_for_timeout(6000)
        after = await page.evaluate("() => document.body.innerText")
        await page.screenshot(path=OUT / "2-invalid-key.png", full_page=True)
        saved = await page.evaluate("() => localStorage.getItem('chat-demo:api-key')")
        check("假 Key 报错明确", "API Key 无效" in after or "校验失败" in after,
              after[after.find("验证并连接"):][:60].replace("\n", " "))
        check("假 Key 没有被保存", not saved, f"localStorage={saved!r}")

        # 假 Key 请求必然返回 401，浏览器会在控制台打印一条资源加载失败。
        # 那是预期行为，不算 App 的问题；这里只过滤这一条，其余错误照旧算失败。
        unexpected = [e for e in errors if "401" not in e]
        check("无意外控制台错误（401 属预期，已过滤）", not unexpected, "; ".join(unexpected[:3]))

        report = {"body": body, "after": after, "consoleErrors": errors, "savedKey": saved}
        (OUT / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

        await browser.close()
    print("\n判定:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
