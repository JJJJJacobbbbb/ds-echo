# 应用图标与启动图

## 设计

主图形是用户在 `tools/icon-grid.html` 工作台里手选的**条形地砖组合**（回字形交错的地砖语言）：
23 块砖拼成一个带缺口、向右带一小截突出的块状体，白底、单色 `#3D7CFF`。

选择记录在 `tools/icon-selection.json`（块坐标，不是归一化坐标——归一化坐标依赖窗口宽高比，
换分辨率会变形；块坐标 + 固定块边长 152px 能精确复原）。

### 尺寸取舍（踩过的坑）

- 图形宽高比是 **2:1**，塞进正方形安全区后高度只用一半，容易显得小
- 标准安全区 66dp：桌面 168px 下偏小
- 82dp：两端贴到圆形遮罩边缘，会被切
- **最终取 74dp**：有存在感且留了安全余量

### 一个关于单位的教训

判断图标大小必须用 **dp / 真实物理像素**，不能用 CSS px：
48dp 在他们手机上（560dpi = 3.5×）实际是 **168 物理像素**。
用 48px 去判断会把本来合格的图形误判成"糊"。

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
