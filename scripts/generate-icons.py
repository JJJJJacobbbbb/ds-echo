"""生成 DS Echo 的应用图标与启动图。

主图形来自 `tools/icon-selection.json`（在 `tools/icon-grid.html` 工作台里手选的
「条形地砖」组合）。这里把它按块坐标精确复原，**先求并集轮廓**再输出——
早期版本是每块砖画一个矩形，相邻矩形共享边各画一次，抗锯齿导致蓝色内部出现发丝状浅色缝。

坐标处理：
- 所有砖块坐标都是 76px 的倍数，所以先转成 76 单位的整数格子，再在格子上求边界。
- 边界边求法：每个格子的 4 条有向边入集合，成对出现的（相邻格子共享的边）互相抵消，
  剩下的就是外轮廓与洞的边界，再串成闭合环。
- 输出一条 path，`fillType="evenOdd"`，洞就会自动被挖空。

用法： python scripts/generate-icons.py
"""
import json
import pathlib
from collections import defaultdict

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SELECTION = ROOT / "tools" / "icon-selection.json"

BLUE = (61, 124, 255, 255)
WHITE = (255, 255, 255, 255)
BLUE_HEX = "#3D7CFF"

CANVAS = 108                 # 自适应图标画布（dp）
UNIT = 76                    # 砖块短边（工作台像素），所有坐标都是它的倍数
# 图形宽度占画布的比例：58/108 ≈ 0.537。
# 74/108 时两侧几乎贴边（用户反馈"比例有点大"），58 留出白边后桌面观感更稳。
MARK_RATIO = 58 / 108
LEGACY_RATIO = 0.62          # 传统图标（Android 8 以下）里图形占的比例
SPLASH_RATIO = 0.18          # 启动图里图形占短边的比例
SS = 8                       # 超采样倍数

DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def load_cells() -> set[tuple[int, int]]:
    """选择文件 → 76 单位整数格子集合"""
    data = json.loads(SELECTION.read_text(encoding="utf-8"))
    cells: set[tuple[int, int]] = set()
    for key in data["cells"]:
        _, col, row, sub = key.split(":")
        col, row, sub = int(col), int(row), int(sub)
        bx, by = col * 2, row * 2
        if (row + col) % 2 == 0:
            # 横排方块里的砖：2 宽 1 高
            cells |= {(bx + i, by + sub) for i in range(2)}
        else:
            # 竖排方块里的砖：1 宽 2 高
            cells |= {(bx + sub, by + j) for j in range(2)}
    return cells


def union_loops(cells: set[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    """格子集合 → 闭合轮廓环（外环 + 洞），方向由「填充在左」保证一致"""
    edges: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    for (i, j) in cells:
        for a, b in (
            ((i, j), (i + 1, j)),
            ((i + 1, j), (i + 1, j + 1)),
            ((i + 1, j + 1), (i, j + 1)),
            ((i, j + 1), (i, j)),
        ):
            if (b, a) in edges:
                edges.discard((b, a))     # 与相邻格子共享的边抵消
            else:
                edges.add((a, b))

    starts: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for a, b in edges:
        starts[a].append(b)

    loops: list[list[tuple[int, int]]] = []
    while edges:
        first = next(iter(edges))
        loop = [first[0]]
        cur = first
        while cur in edges:
            edges.discard(cur)
            loop.append(cur[1])
            nxt = next(((cur[1], end) for end in starts[cur[1]] if (cur[1], end) in edges), None)
            if nxt is None:
                break
            cur = nxt
        if loop[0] == loop[-1]:
            loop.pop()
        loops.append(loop)
    return loops


def transform(loops, cells, canvas_px: int, ratio: float):
    """把格子坐标映射到画布像素；返回每个环的点列表"""
    xs = [i for i, _ in cells]
    ys = [j for _, j in cells]
    minx, maxx = min(xs), max(xs) + 1
    miny, maxy = min(ys), max(ys) + 1
    scale = (ratio * canvas_px) / (maxx - minx)
    ox = (canvas_px - (maxx - minx) * scale) / 2
    oy = (canvas_px - (maxy - miny) * scale) / 2
    return [
        [((x - minx) * scale + ox, (y - miny) * scale + oy) for x, y in loop]
        for loop in loops
    ]


def render(canvas_px: int, ratio: float, cells, loops, bg=WHITE) -> Image.Image:
    big = canvas_px * SS
    img = Image.new("RGBA", (big, big), bg)
    polys = transform(loops, cells, big, ratio)
    d = ImageDraw.Draw(img)
    # 面积大的先填蓝，其余填回背景色 —— 等价于 even-odd 挖洞
    order = sorted(range(len(polys)), key=lambda i: -abs(_area(polys[i])))
    for rank, idx in enumerate(order):
        d.polygon(polys[idx], fill=BLUE if rank == 0 else bg)
    return img.resize((canvas_px, canvas_px), Image.LANCZOS)


def _area(points) -> float:
    s = 0.0
    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]
        s += x1 * y2 - x2 * y1
    return s / 2


def vector_xml(cells, loops) -> str:
    """单条 path + evenOdd：洞自动挖空，也没有内部接缝"""
    polys = transform(loops, cells, CANVAS, MARK_RATIO)
    segments = []
    for poly in polys:
        pts = " L".join(f"{x:.2f},{y:.2f}" for x, y in poly)
        segments.append(f"M{pts} Z")
    data = " ".join(segments)
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!-- 由 scripts/generate-icons.py 生成，请勿手改 -->\n"
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        f'    android:width="{CANVAS}dp"\n'
        f'    android:height="{CANVAS}dp"\n'
        f'    android:viewportWidth="{CANVAS}"\n'
        f'    android:viewportHeight="{CANVAS}">\n'
        f'    <path android:fillColor="{BLUE_HEX}" android:fillType="evenOdd" android:pathData="{data}" />\n'
        "</vector>\n"
    )


ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- 由 scripts/generate-icons.py 生成，请勿手改 -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <!-- Android 13+ 主题图标：系统按壁纸取色重新着色，只看 alpha 通道 -->
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
"""


def main() -> None:
    cells = load_cells()
    loops = union_loops(cells)
    print(f"格子 {len(cells)} 个，并集轮廓 {len(loops)} 个环，点数 {[len(l) for l in loops]}")

    # Capacitor 模板自带 drawable-v24/ic_launcher_foreground.xml（默认图标）。
    # API >= 24 时 -v24 限定符优先于 drawable/，会把我们写的矢量完全遮盖——
    # 桌面因此一直显示默认图标（本项目踩过，排查很久）。每次生成都清掉。
    for stale in RES.glob("drawable-v24/ic_launcher_foreground.xml"):
        stale.unlink()
        print("已删除 drawable-v24/ic_launcher_foreground.xml")
    stale_dir = RES / "drawable-v24"
    if stale_dir.is_dir() and not any(stale_dir.iterdir()):
        stale_dir.rmdir()

    drawable = RES / "drawable"
    drawable.mkdir(exist_ok=True)
    (drawable / "ic_launcher_foreground.xml").write_text(vector_xml(cells, loops), encoding="utf-8")

    anydpi = RES / "mipmap-anydpi-v26"
    anydpi.mkdir(exist_ok=True)
    (anydpi / "ic_launcher.xml").write_text(ADAPTIVE_XML, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(ADAPTIVE_XML, encoding="utf-8")

    for name, factor in DENSITIES.items():
        d = RES / f"mipmap-{name}"
        d.mkdir(exist_ok=True)
        render(round(108 * factor), MARK_RATIO, cells, loops, bg=(0, 0, 0, 0)).save(
            d / "ic_launcher_foreground.png"
        )
        legacy = render(round(48 * factor), LEGACY_RATIO, cells, loops)
        legacy.save(d / "ic_launcher.png")
        mask = Image.new("L", (legacy.width * 4, legacy.height * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, legacy.width * 4 - 1, legacy.height * 4 - 1], fill=255)
        rounded = legacy.copy()
        rounded.putalpha(mask.resize(legacy.size, Image.LANCZOS))
        rounded.save(d / "ic_launcher_round.png")

    for path in sorted(RES.glob("drawable*/*splash*.png")):
        with Image.open(path) as src:
            size = src.size
        mark = round(min(size) * SPLASH_RATIO)
        canvas_big = Image.new("RGBA", (size[0] * 2, size[1] * 2), WHITE)
        mark_img = render(mark, 1.0, cells, loops).resize((mark, mark), Image.LANCZOS)
        canvas_big.alpha_composite(
            mark_img, ((canvas_big.width - mark) // 2, (canvas_big.height - mark) // 2)
        )
        canvas_big.convert("RGB").resize(size, Image.LANCZOS).save(path)

    print("已生成：矢量前景（单路径 evenOdd）/ 自适应图标 / 5 档传统图标 / 启动图")


if __name__ == "__main__":
    main()
