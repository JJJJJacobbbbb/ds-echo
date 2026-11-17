# 应用图标与启动图

## 设计

白底 + 蓝色「声呐」标记：中央圆点 + 左右各两条同心弧，主色 `#3D7CFF`。

为什么是这个：

- **风格延续**：和上游 Capacitor 默认图标同一套语言（纯白底、单一蓝色几何图形），
  改动最小，不会让人觉得"换了个 App"
- **隐喻准确**：声呐就是"回声"，正好对上 DS Echo 的名字
- **构图对称**：视觉重心在正中，圆形/方形/圆角矩形遮罩下都不会切到图形
- **小尺寸可认**：48dp 下仍能分辨出"中间一点、两侧弧线"

第一版画的是"从左侧向右扩散"的三条弧（像 WiFi），被否掉的原因：构图偏左、右侧大片空白，
而且太像网络工具图标。

## 生成方式

不手改资源，全部由脚本产出：

```powershell
python scripts/generate-icons.py
```

脚本负责：

| 产物 | 说明 |
|---|---|
| `drawable/ic_launcher_foreground.xml` | 矢量前景层（108dp 画布，图形限制在 66dp 安全区内），任意尺寸都清晰 |
| `mipmap-anydpi-v26/ic_launcher{,_round}.xml` | 自适应图标描述，含 Android 13+ 的 `<monochrome>` 主题图标层 |
| `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` | Android 8 以下的传统图标（48dp 基准） |
| `.../ic_launcher_round.png` | 同上，圆形遮罩版 |
| `.../ic_launcher_foreground.png` | 前景层 PNG 兜底 |
| `drawable*/*splash*.png` | 11 张启动图（白底 + 居中标记，保持原有每档尺寸） |

改配色只改脚本顶部的 `BLUE`；改图形大小改 `ARC_RADII` / `DOT_R` / `STROKE`。

## 验证状态

- 构建通过：`.\scripts\build-apk.ps1 -Release` → 4.96 MB，资源编译无报错
  （矢量路径、自适应图标 XML、monochrome 层都通过了 aapt2 校验）
- 离线合成预览（白底 + 前景 + 圆形遮罩，模拟启动器）：`.verify/icon/composite-circle.png`
- **未验证**：真机桌面上的实际显示效果。装机时手机 USB 断开，
  需要重新连接后安装确认（这一步能验证：图标是否被启动器正确裁切、
  圆形/方形遮罩下图形有没有被切边、Android 13+ 主题图标是否正确着色）。

## 已知取舍

- 启动图只是把标记画在白底上，没有做渐变或品牌字。
  启动画面停留时间很短，做得越复杂越容易和首屏衔接不上。
- 主题图标（monochrome）直接复用了带颜色的前景层：系统只看 alpha 通道，
  会自动重新着色，所以不需要单独画一份单色版。
