# Nikon Z50II Explorer 最终验收记录

验收日期：2026-09-01（Asia/Shanghai）
验收范围：设计说明第 12 节全部自动验证与人工验收条目
结论：**PASS（14/14）**

## 精度与范围声明

本交付为基于公开资料的参考级结构重建，**不是 Nikon 原厂 CAD、维修图纸、制造数据或安全判断依据**。无法从公开资料直接确认的内部结构、材料细节和装配关系为可解释的参考重建。镜头模型在本期明确延期；交付仅保留机身 Z 卡口接口。

## 12.1 自动验证

| 状态 | 设计验收标准 | 具体证据 |
|---|---|---|
| PASS | 所有模块通过 glTF/GLB 结构验证。 | `blender/tests/assert_exports.py` 独立运行退出 0，报告 `16 GLBs, 8 modules, 100 aligned parts, 10 decals`；产物位于 `dist/assets/models/high/` 与 `dist/assets/models/low/`，各 8 个 GLB。 |
| PASS | 全部 `partId` 唯一且在模型和清单之间一一对应。 | `dist/assembly-manifest.json`：schema 1、100 个零件、100 个唯一 ID；`blender/tests/assert_exports.py` 会逐一重新导入 GLB 并核对节点 extras。 |
| PASS | 所有模块世界坐标一致，装配态无明显错位。 | `blender/tests/assert_exports.py` 报告 100 个 aligned parts；`blender/tests/assert_internal_geometry.py` 检查 495/496 个 Task-6 根零件对、896 个保留零件对且可选根穿插为 0；装配参考图 `renders/assembled-studio.png`（源证据 `artifacts/renders/assembled-studio.png`）和浏览器基线 `tests/e2e/__screenshots__/z50ii-assembled-studio.png` 已按原始分辨率检查。 |
| PASS | 拆解依赖无循环，引用的零件 ID 均存在。 | `blender/validate_scene.py` 与 `blender/tests/assert_exports.py` 独立退出 0；`tests/e2e/viewer.spec.ts` 在主板依赖未满足时确认锁定、警告和零位移。 |
| PASS | 贴图、HDR 和 GLB 路径完整；离线构建不请求外部资源。 | `dist/assets/` 包含环境、贴图、Draco 运行时及 16 个 GLB；清单使用相对路径。`scripts/package-release.ps1` 验证高/低 GLB 数量和清单结构；`scripts/start-viewer.ps1` 仅在 `127.0.0.1:4173` 提供本地 `dist/`。 |
| PASS | 浏览器生产构建与基础交互测试通过。 | `scripts/pnpm.ps1 build` 退出 0；`scripts/pnpm.ps1 test` 为 20 files / 122 tests；`scripts/pnpm.ps1 test:e2e` 为 Chrome+Edge 30/30。完整一键流程 `scripts/build-all.ps1` 退出 0，并在渲染/导出前 fail-fast 执行内部几何和拆卸运动断言。 |

## 12.2 人工验收

| 状态 | 设计验收标准 | 具体证据 |
|---|---|---|
| PASS | Z50II 外观比例、主要按键、卡口、屏幕、EVF、闪光灯和接口具有明确辨识度。 | 原始 1600×1200 检查：`artifacts/renders/assembled-studio.png`、`artifacts/renders/exploded-studio.png`；六向轮廓证据位于 `artifacts/renders/silhouette/`。可辨认手柄、Z 卡口、模式拨盘、EVF、热靴/闪光灯和侧接口。 |
| PASS | 约 70–100 个对象可从零件树或 3D 视窗选择。 | `tests/e2e/viewer.spec.ts` 在加载 8 模块后断言 100 个稳定零件 locator；`task-16-browser-assembled.png` 显示零件树与已选螺钉。 |
| PASS | 引导拆解可从完整装配态运行到完整爆炸态并返回。 | `tests/e2e/viewer.spec.ts` 在 Chrome 与 Edge 中捕获全部 100 个零件的完整 16 元素局部矩阵，断言 0→1→0 后序列化状态逐字节相同；全景爆炸证据 `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-16-browser-exploded.png`。Blender 渲染报告最大恢复矩阵差 `1.192e-07` 并确认精确恢复。 |
| PASS | 自由拆解遵守移动轴、位移范围和依赖锁，不出现明显穿模。 | `blender/tests/assert_removal_motion.py` 以不超过 0.25 mm 的采样间距验证 100 个自由根（10,420 个样本）和 18 个引导组（2,252 个样本）均无碰撞；Memory B 保持主板法向拆卸轴并以 10 mm 服务抬升避开后帘。`tests/e2e/task13-free-disassembly.spec.ts` 与 `tests/e2e/viewer.spec.ts` 另验证约束拖动、依赖锁、取消、撤销和复位。 |
| PASS | 透明、隔离、剖切、灯光切换和复位功能可用。 | `tests/e2e/viewer.spec.ts` 在两浏览器验证隐藏、幽灵、隔离、可见性复位、X 剖切开关及 studio/inspection 灯光；补充证据 `task-14-ghost-isolate.png`、`task-14-cutaway.png`、`task-14-inspection-lighting.png`。 |
| PASS | Blender 与浏览器中的材质观感一致，金属、橡胶、塑料和玻璃可明确区分。 | 原始分辨率检查上述两张 Blender 参考图、浏览器基线和最终截图；黑色橡胶手柄、哑光塑料外壳、经校准的金属卡口/骨架、蓝/绿/洋红干涉色传感器盖玻璃和绿色 PCB 具有可分辨高光、粗糙度与色彩。受控基线以 RGB≥250 计算“截断像素/有效像素”，并用四邻域连通分量阻止大面积白块；最终完整运行 Chrome 为 `0.025243287606987925` / `363 px`、Edge 为 `0.025248795583219047` / `363 px`，分别低于 `0.06` 与 `512 px` 硬门限。最大分量边界在两浏览器均为 `(576,363)–(585,480)`，不位于传感器区域。 |
| PASS | 摄影棚光照具有自然高光、轮廓光和接触阴影；内部检查灯光能看清结构。 | `artifacts/renders/assembled-studio.png` 与 `exploded-studio.png` 已按 1600×1200 原图检查：柔和轮廓光、地面接触阴影和内部层次可读；浏览器 inspection 证据为 `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-14-inspection-lighting.png`。 |
| PASS | Chrome 与 Edge 桌面端均可完成核心操作。 | 安装版 Chrome `152.0.7977.64` 与 Edge `151.0.4129.107`，Playwright 最终 30/30；最终独立冷启动为 Chrome 3/3（`0.025375234521575984` / `363 px`）、Edge 3/3（`0.025366185455782155` / `363 px`），且各自使用新建 preview/browser 进程。`tests/e2e/viewer.spec.ts` 两浏览器均完成正常及 GLB 重试恢复流程，未记录意外 console/page error。恢复证据 `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-16-browser-recovered.png`。 |

## 运行时与工具版本

| 组件 | 精确版本 |
|---|---|
| Blender | 4.5.12 LTS，build hash `84afd5f785f7`（built 2026-07-21） |
| Chrome | 152.0.7977.64（安装版桌面 channel） |
| Edge | 151.0.4129.107（安装版桌面 channel） |
| Node.js | 24.19.0（Codex bundled runtime） |
| pnpm | 11.19.0 |
| PowerShell | 7.6.4（一键构建验证）；Windows PowerShell 5.1 兼容脚本调用 |
| Python | 3.13.5（离线启动器探测；最低要求 3.8） |
| Three.js | 0.185.1 |
| Playwright | 1.62.1 |
| Vite | 8.2.2 |
| Vitest | 4.1.10 |
| TypeScript | 7.0.2 |

## 性能证据

测试文件：`artifacts/validation/performance.json`；1920×1080、高质量、安装版浏览器 headless channel、Intel Arc / Direct3D 11、每浏览器 3 次。统计按文件所述方法取中位数，完整爆炸取三次最小值。

| 浏览器 | 三角形 | 解码纹理 | 初始预加载 | 全 8 模块 | 轨道旋转 FPS | 完整爆炸最低 FPS |
|---|---:|---:|---:|---:|---:|---:|
| Chrome 152.0.7977.64 | 223,099 | 314,573,568 B | 1,172.839 ms | 827.993 ms | 40.161 | 29.940 |
| Edge 151.0.4129.107 | 223,099 | 314,573,568 B | 811.571 ms | 1,034.635 ms | 59.880 | 39.841 |

## 交付尺寸与 SHA-256

| 文件/集合 | 字节 | SHA-256 / 说明 |
|---|---:|---|
| `artifacts/z50ii_master.blend` | 8,669,632 | `341ecd85d13c74c9246ae7cb3d4d45f9949f1fc56b3ae5c2f53761950f71f17c` |
| `dist/assembly-manifest.json` | 77,818 | `7913da12c60b057eb1bd94e0fab1b9ccc69a14b7170350206b7c989cfda88198` |
| `artifacts/renders/assembled-studio.png` | 1,917,121 | `ae91bd9d6c70fcf4a043c9450f6fefd1ed26fb04a7cd12fc6bddd990a00e6623` |
| `artifacts/renders/exploded-studio.png` | 1,889,660 | `f8902ff925dabf1fed85dd44239e6f19f73be1de713eb7bb827ce94c1cb1d94b` |
| `public/assets/environment/studio-neutral-1k.hdr` | 767,981 | `fa66fed36cd856da1bac9eed0c80d25b4030c997eb2f8624bdfabf683e7ed4ec` |
| `artifacts/validation/performance.json` | 4,858 | `6b0221c6be93868ae0ead40053ecdbf2650f9dba97aa737b5a781e1eb0f7ed44` |
| `tests/e2e/__screenshots__/z50ii-assembled-studio.png` | 169,622 | `2538315ac70ca02ffd26eae54af00d1f51e7b7b648efd914128a93be89ca30c8` |
| `dist/` | 35,947,288 | 45 files；含 8 high 与 8 low GLB |
| `artifacts/textures/` | 18,250,632 | 7 files |
| `artifacts/renders/` | 7,100,360 | 8 files |

## 原始分辨率视觉检查记录

- `artifacts/renders/assembled-studio.png`：1600×1200；相机外观比例清晰，金属卡口、橡胶手柄、塑料外壳、玻璃/传感器和 PCB 可区分；高光未吞没轮廓，地面接触阴影自然。
- `artifacts/renders/exploded-studio.png`：1600×1200；主要外壳、骨架、PCB、卡口、显示/EVF 与接口层级分离且仍可追踪装配关系。
- `tests/e2e/__screenshots__/z50ii-assembled-studio.png`：880×684 canvas 原图；黑底 studio 光照下整机轮廓、内部结构与 HUD 可读，中央传感器盖玻璃保留蓝、绿、洋红表面变化，不再出现连续白色矩形；全局高光门限按有效像素计算，并由四邻域最大分量 `363 px` 守卫局部缺陷。
- `task-16-browser-assembled.png`、`task-16-browser-exploded.png`、`task-16-browser-recovered.png`：1440×900 原图；最终爆炸图在捕获前使用当前可见包围盒重新拟合 3/4 相机，全部组件保持在视窗内；恢复图显示 8/8 模块与重试计数 1。

## 已知限制

- 镜头模型延期，不包含在本期交付；仅保留 Z 卡口机身接口。
- 内部结构为参考级重建，不代表 Nikon 原厂 CAD、尺寸公差、材料牌号或维修顺序。
- 离线查看需要 Python 3.8+；构建环境需要仓库本地 Blender、Codex 捆绑 Node 和已安装依赖。
- 高质量配置解码纹理约 300 MiB；低显存设备应选择“自动”或“低”质量。
- Vite 对主 JavaScript chunk 给出大于 500 kB 的非阻断建议；离线功能与验收不受影响。
