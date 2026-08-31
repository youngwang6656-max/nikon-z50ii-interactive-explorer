# Nikon Z50II 交互式结构探索器

这是一个可离线运行的 Nikon Z50II 参考级拆解模型，包含 100 个可交互零件、8 个结构模块、引导拆解、自由拆解和检查工具。内部结构依据公开资料进行参考重建，并非 Nikon 原厂 CAD 或维修替代资料。

## 离线启动

1. 完整解压 `Z50II-Explorer.zip`，不要只在压缩包预览窗口内运行文件。
2. 确认电脑已安装 Python 3.8 或更高版本；运行查看器不需要 Node.js。
3. 在解压后的 `Z50II-Explorer` 目录中运行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-viewer.ps1
   ```

4. 启动器会在 `127.0.0.1:4173` 提供本地静态站点并打开默认浏览器。请保留终端窗口；按 `Ctrl+C` 停止服务。

若提示端口不可用，请关闭占用 4173 端口的程序后重试。若提示找不到 Python，请安装 Python 3.8+ 并确保 `py`、`python` 或 `python3` 可从命令行调用。不要直接双击 `dist/index.html`，因为浏览器的 `file://` 安全策略会阻止模块和模型加载。

## 操作说明

- 左侧组件树可搜索、展开模块并选择零件；也可直接在 3D 视窗中点选。
- “引导拆解”按 40 个拆卸步骤推进。可用播放、上一步、下一步或序列进度滑块，从完整装配态到完整爆炸态，再精确返回装配态。
- “自由拆解”允许沿零件规定轴和位移范围拖动，或使用部件位移滑块。依赖未满足时零件会锁定并显示前置零件；“撤销移动”撤销最近一次有效操作，“复位装配”恢复完整装配态。
- 部件信息区提供隐藏、幽灵透明、隔离与可见性复位。检查工具提供 X/Y/Z 剖切、剖切面偏移、摄影棚/内部检查灯光，以及前、后、左、右、顶和 3/4 相机视图。
- 质量设为“自动”时会依据运行状态在高/低模型间选择；也可手动选择高或低。模块加载失败时使用对应模块的“重试”按钮，当前可用场景会保留到恢复成功。
- 鼠标左键拖动用于视图/零件交互，滚轮缩放；`Esc` 取消当前拖动，输入控件之外可用 `Ctrl+Z` 撤销自由拆解操作。

## Blender 源文件

- 可编辑主场景：`z50ii_master.blend`（仓库源路径为 `artifacts/z50ii_master.blend`）。
- `textures/` 保存源/烘焙贴图，`renders/` 保存 1600×1200 装配态与爆炸态摄影棚参考图。
- 模型使用米制单位、Blender Z-up；浏览器导出转换为 glTF Y-up。零件身份和装配规则以 `dist/assembly-manifest.json` 为准。

## 从仓库重新构建

完整构建需要仓库本地 Blender 4.5.12、已安装依赖以及 Codex 捆绑的 Node 运行时。仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-all.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
```

第一条命令依次重建 Blender 主场景、验证场景、渲染 HDR 和参考图、导出高/低 GLB 与清单、执行 Blender 导出断言、单元测试、生产构建，以及安装版 Chrome/Edge 的 Playwright 验收。任一步骤失败都会立即停止。第二条命令验证所有输入并生成 `release/Z50II-Explorer/` 与 `release/Z50II-Explorer.zip`。

`scripts/pnpm.ps1` 是可独立运行的仓库入口：它会自行定位 Codex 捆绑 Node，并将 Node 目录与仓库 `node_modules/.bin` 前置到子进程 `PATH`。因此下面的单项命令不依赖全局 `node`/`pnpm`/`npx`；可用 `./scripts/pnpm.ps1 exec node --version` 直接验证捆绑运行时。

需要单独运行时，可使用：

```powershell
.\scripts\run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/validate_scene.py
.\scripts\run-blender.ps1 --background --factory-startup --python blender/tests/assert_exports.py
.\scripts\pnpm.ps1 test
.\scripts\pnpm.ps1 build
.\scripts\pnpm.ps1 test:e2e
```

## 精度与范围声明

本项目用于结构展示和交互演示。外观比例与公开可见控制件以 Nikon 官方公开资料为参考；无法从公开资料直接确认的内部几何为参考级重建，不代表 Nikon 原厂设计、公差、材料规格、装配工艺或维修步骤。镜头模型不在本期交付范围内，Z 卡口仅作为机身接口呈现。请勿将本项目用于维修、安全判断或制造。

English summary: Offline reference reconstruction of a Nikon Z50II body with 100 selectable parts in eight modules. Extract the ZIP and run `start-viewer.ps1` with Python 3.8+; no Node.js is required for viewing. Internal geometry is not manufacturer CAD, and the lens is intentionally deferred.
