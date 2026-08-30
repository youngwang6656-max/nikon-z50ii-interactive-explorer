# Nikon Z50II Explorer 最终验收记录

验收日期：2026-08-30（Asia/Shanghai）
验收范围：设计说明第 12 节全部自动验证与人工验收条目
结论：**PASS（14/14）**

## 精度与范围声明

本交付为基于公开资料的参考级结构重建，**不是 Nikon 原厂 CAD、维修图纸、制造数据或安全判断依据**。无法从公开资料直接确认的内部结构、材料细节和装配关系为可解释的参考重建。镜头模型在本期明确延期；交付仅保留机身 Z 卡口接口。

## 12.1 自动验证

| 状态 | 设计验收标准 | 具体证据 |
|---|---|---|
| PASS | 所有模块通过 glTF/GLB 结构验证。 | `blender/tests/assert_exports.py` 独立运行退出 0，报告 `16 GLBs, 8 modules, 100 aligned parts, 10 decals`；产物位于 `dist/assets/models/high/` 与 `dist/assets/models/low/`，各 8 个 GLB。 |
| PASS | 全部 `partId` 唯一且在模型和清单之间一一对应。 | `dist/assembly-manifest.json`：schema 1、100 个零件、100 个唯一 ID；`blender/tests/assert_exports.py` 会逐一重新导入 GLB 并核对节点 extras。 |
| PASS | 所有模块世界坐标一致，装配态无明显错位。 | `blender/tests/assert_exports.py` 报告 100 个 aligned parts；装配参考图 `renders/assembled-studio.png`（源证据 `artifacts/renders/assembled-studio.png`）和浏览器基线 `tests/e2e/__screenshots__/z50ii-assembled-studio.png` 已按原始分辨率检查。 |
| PASS | 拆解依赖无循环，引用的零件 ID 均存在。 | `blender/validate_scene.py` 与 `blender/tests/assert_exports.py` 独立退出 0；`tests/e2e/viewer.spec.ts` 在主板依赖未满足时确认锁定、警告和零位移。 |
| PASS | 贴图、HDR 和 GLB 路径完整；离线构建不请求外部资源。 | `dist/assets/` 包含环境、贴图、Draco 运行时及 16 个 GLB；清单使用相对路径。`scripts/package-release.ps1` 验证高/低 GLB 数量和清单结构；`scripts/start-viewer.ps1` 仅在 `127.0.0.1:4173` 提供本地 `dist/`。 |
| PASS | 浏览器生产构建与基础交互测试通过。 | `scripts/pnpm.ps1 build` 退出 0；`scripts/pnpm.ps1 test` 为 20 files / 122 tests；`scripts/pnpm.ps1 test:e2e` 为 Chrome+Edge 28/28。完整一键流程 `scripts/build-all.ps1` 退出 0。 |

## 12.2 人工验收

| 状态 | 设计验收标准 | 具体证据 |
|---|---|---|
| PASS | Z50II 外观比例、主要按键、卡口、屏幕、EVF、闪光灯和接口具有明确辨识度。 | 原始 1600×1200 检查：`artifacts/renders/assembled-studio.png`、`artifacts/renders/exploded-studio.png`；六向轮廓证据位于 `artifacts/renders/silhouette/`。可辨认手柄、Z 卡口、模式拨盘、EVF、热靴/闪光灯和侧接口。 |
| PASS | 约 70–100 个对象可从零件树或 3D 视窗选择。 | `tests/e2e/viewer.spec.ts` 在加载 8 模块后断言 100 个稳定零件 locator；`task-16-browser-assembled.png` 显示零件树与已选螺钉。 |
| PASS | 引导拆解可从完整装配态运行到完整爆炸态并返回。 | `tests/e2e/viewer.spec.ts` 断言进度 0→1→0 且选中件变换基矩阵完全恢复；全景爆炸证据 `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-16-browser-exploded.png`。Blender 渲染报告最大恢复矩阵差 `1.192e-07` 并确认精确恢复。 |
| PASS | 自由拆解遵守移动轴、位移范围和依赖锁，不出现明显穿模。 | `tests/e2e/task13-free-disassembly.spec.ts` 与 `tests/e2e/viewer.spec.ts` 验证约束拖动、0–1000 范围、依赖锁、取消、撤销和复位；证据 `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-13-locked-dependency.png`。 |
| PASS | 透明、隔离、剖切、灯光切换和复位功能可用。 | `tests/e2e/viewer.spec.ts` 在两浏览器验证隐藏、幽灵、隔离、可见性复位、X 剖切开关及 studio/inspection 灯光；补充证据 `task-14-ghost-isolate.png`、`task-14-cutaway.png`、`task-14-inspection-lighting.png`。 |
| PASS | Blender 与浏览器中的材质观感一致，金属、橡胶、塑料和玻璃可明确区分。 | 原始分辨率检查上述两张 Blender 参考图、浏览器基线和最终截图；黑色橡胶手柄、哑光塑料外壳、金属卡口/骨架、玻璃/传感器和绿色 PCB 具有可分辨高光、粗糙度与色彩。 |
| PASS | 摄影棚光照具有自然高光、轮廓光和接触阴影；内部检查灯光能看清结构。 | `artifacts/renders/assembled-studio.png` 与 `exploded-studio.png` 已按 1600×1200 原图检查：柔和轮廓光、地面接触阴影和内部层次可读；浏览器 inspection 证据为 `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-14-inspection-lighting.png`。 |
| PASS | Chrome 与 Edge 桌面端均可完成核心操作。 | 安装版 Chrome `152.0.7977.64` 与 Edge `151.0.4129.107`，Playwright 最终 28/28；`tests/e2e/viewer.spec.ts` 两浏览器均完成正常及 GLB 重试恢复流程，未记录意外 console/page error。恢复证据 `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-16-browser-recovered.png`。 |

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
| Chrome 152.0.7977.64 | 223,099 | 314,572,800 B | 1,460.642 ms | 1,204.863 ms | 40.000 | 29.851 |
| Edge 151.0.4129.107 | 223,099 | 314,572,800 B | 1,087.366 ms | 1,139.909 ms | 59.880 | 30.030 |

## 交付尺寸与 SHA-256

| 文件/集合 | 字节 | SHA-256 / 说明 |
|---|---:|---|
| `artifacts/z50ii_master.blend` | 8,669,632 | `41549ed4eb0f91f6c9d235aba92443d860c8f021593d83dae6c10dab8215bfc4` |
| `dist/assembly-manifest.json` | 77,819 | `5acd185c7256f404bb817d9504843d190b13be7a9ff6326f66c81aac09faaa25` |
| `artifacts/renders/assembled-studio.png` | 1,931,095 | `7e01602f247272b35c58a5c827139868d4fbb4272bded077cdbafd08aa458da0` |
| `artifacts/renders/exploded-studio.png` | 1,890,477 | `e06ec4caf257f39886adf3b666528eca1fc82bba53b8ee6e0c5a9a623e577a98` |
| `public/assets/environment/studio-neutral-1k.hdr` | 767,981 | `fa66fed36cd856da1bac9eed0c80d25b4030c997eb2f8624bdfabf683e7ed4ec` |
| `artifacts/validation/performance.json` | 4,866 | `e2f02d55217ad0e7204bae0b2f798ab84e456742091de6193b5ad64c7f860250` |
| `tests/e2e/__screenshots__/z50ii-assembled-studio.png` | 158,019 | `8f5f6f717ae017e1737e2ed0b7244ad94b08f7ed550899832bb0d61163af42a6` |
| `dist/` | 35,946,085 | 45 files；含 8 high GLB（4,082,608 B）与 8 low GLB（4,004,508 B） |
| `artifacts/textures/` | 18,250,632 | 7 files |
| `artifacts/renders/` | 7,115,151 | 8 files |

## 原始分辨率视觉检查记录

- `artifacts/renders/assembled-studio.png`：1600×1200；相机外观比例清晰，金属卡口、橡胶手柄、塑料外壳、玻璃/传感器和 PCB 可区分；高光未吞没轮廓，地面接触阴影自然。
- `artifacts/renders/exploded-studio.png`：1600×1200；主要外壳、骨架、PCB、卡口、显示/EVF 与接口层级分离且仍可追踪装配关系。
- `tests/e2e/__screenshots__/z50ii-assembled-studio.png`：880×684 canvas 原图；黑底 studio 光照下整机轮廓、内部结构与 HUD 可读，亮部边缘仍保留。
- `task-16-browser-assembled.png`、`task-16-browser-exploded.png`、`task-16-browser-recovered.png`：1440×900 原图；最终爆炸图在捕获前使用当前可见包围盒重新拟合 3/4 相机，全部组件保持在视窗内；恢复图显示 8/8 模块与重试计数 1。

## 已知限制

- 镜头模型延期，不包含在本期交付；仅保留 Z 卡口机身接口。
- 内部结构为参考级重建，不代表 Nikon 原厂 CAD、尺寸公差、材料牌号或维修顺序。
- 离线查看需要 Python 3.8+；构建环境需要仓库本地 Blender、Codex 捆绑 Node 和已安装依赖。
- 高质量配置解码纹理约 300 MiB；低显存设备应选择“自动”或“低”质量。
- Vite 对主 JavaScript chunk 给出大于 500 kB 的非阻断建议；离线功能与验收不受影响。
