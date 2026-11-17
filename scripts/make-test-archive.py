"""生成导入功能用的测试归档（不要提交到仓库，输出在 chatdata/，已被 .gitignore 忽略）。

生成两个文件：
1. test-merge-one.zip    —— 从真实归档里复制一个会话、换上新 ID 和标题，
                             只含 1 个全新会话。用于验证"导入是合并而不是替换"。
2. test-corrupt.zip      —— 内容不是合法 ZIP，用于验证"损坏文件不改变现有数据"。

用法： python scripts/make-test-archive.py
"""
import json
import pathlib
import uuid
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
REAL = ROOT / "chatdata" / "deepseek_data-2026-11-17.zip"
OUT_ONE = ROOT / "chatdata" / "test-merge-one.zip"
OUT_CORRUPT = ROOT / "chatdata" / "test-corrupt.zip"


def build_one_session_archive() -> None:
    with zipfile.ZipFile(REAL) as src:
        manifest = json.loads(src.read("manifest.json"))
        index = json.loads(src.read("chat_session_index.json"))
        first = index[0]
        session = json.loads(src.read(f"chat_sessions/{first['id']}.json"))
        user = src.read("user.json") if "user.json" in src.namelist() else None

    new_id = str(uuid.uuid4())
    session["id"] = new_id
    session["title"] = "合成测试会话（请勿当真）"
    entry = dict(first)
    entry["id"] = new_id
    entry["title"] = session["title"]

    with zipfile.ZipFile(OUT_ONE, "w", zipfile.ZIP_DEFLATED) as dst:
        dst.writestr("manifest.json", json.dumps(manifest))
        if user is not None:
            dst.writestr("user.json", user)
        dst.writestr(f"chat_sessions/{new_id}.json", json.dumps(session, ensure_ascii=False))
        dst.writestr("chat_session_index.json", json.dumps([entry], ensure_ascii=False))
    print(f"已生成 {OUT_ONE.name}（1 个新会话 {new_id}）")


def build_corrupt_archive() -> None:
    OUT_CORRUPT.write_bytes(b"this is definitely not a zip file" * 10)
    print(f"已生成 {OUT_CORRUPT.name}（{OUT_CORRUPT.stat().st_size} 字节，非法 ZIP）")


if __name__ == "__main__":
    build_one_session_archive()
    build_corrupt_archive()
