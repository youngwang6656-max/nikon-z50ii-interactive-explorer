# Task 15 Implementation Report

## Outcome

Implemented adaptive `high | low | auto` quality profiles, transactional profile replacement, recoverable module loading, isolated material/HDR fallbacks, WebGL2 compatibility messaging, Chrome/Edge E2E coverage, and measured performance evidence.

The implementation preserves the manifest, assembly state, guided/free mode, per-part transforms, selection, visibility/ghost/isolation state, and loaded-module progress while replacing high/low GLBs.

## Acceptance evidence

| Requirement | Evidence |
|---|---|
| 120 moving-frame auto selection | `qualityController.test.ts`: exactly 120 samples; `>22.2 ms` selects low, `<16.7 ms` selects high, `[16.7, 22.2]` retains the current profile as a documented hysteresis band. Non-moving frames are ignored. |
| 10-second stability | `AdaptiveQualityController` enforces a 10,000 ms cooldown; the focused test proves a reverse decision inside the interval is ignored and a later decision is accepted. |
| High/low budgets | High: cap 2, 2048 shadows, 16-sample/full AO, full environment. Low: cap 1.25, 1024 shadows, 8-sample/reduced AO, 0.55 environment. |
| State-preserving switching | `task15-quality-recovery.spec.ts` switches low/high after selecting, entering free mode, moving, and ghosting a part; mode, progress, transform basis, selection effect, and module progress remain unchanged. |
| Recoverable loading | Per-module status/error/retry count and `retry-<moduleId>` buttons are rendered. App operations serialize by module and quality; direct and UI retry tests prove concurrent retries share one operation and increment once. Existing roots remain mounted until the new decoded root validates. |
| Texture fallback | LoadingManager records the exact failed URL. glTF texture references are mapped back to only affected material indices; those materials are cloned to neutral gray `0x777777`, failed texture slots are removed, and no magenta fallback is used. |
| HDR fallback | The neutral `RoomEnvironment` is installed before optional HDR loading. HDR rejection resolves `environmentReady`, records URL/reason on the canvas, and does not block module preload/startup. |
| WebGL2 fallback | A failed WebGL2 preflight removes the canvas and renders a Chinese alert explicitly naming desktop Chrome and desktop Edge; the page-level E2E verifies no secondary canvas/crash. |
| Performance report | `artifacts/validation/performance.json`, validated after the final full browser run. |
| Cleanup | Viewer frame listeners, controls, composer/passes, environments, renderer, module resources, fallback material resources, and app UI listeners retain idempotent disposal. |

## TDD evidence

RED runs captured before production changes:

- Focused unit run: missing `qualityController`, missing HDR helper, missing visibility snapshot/restore, concurrent retry threw while loading, and material fallback did not replace the affected material (`6 failed`, then the corrected visibility test failed with `snapshot is not a function`).
- Browser RED run: quality selector absent, retry control absent, WebGL compatibility message absent (`3 failed / 1 existing HDR path passed`).
- Missing-texture realism RED run: a GLTFLoader-style omitted texture slot was not neutralized until failed material indices were supplied (`1 failed`).

GREEN runs:

- Focused adaptive/recovery suites: `4 files / 29 tests passed`.
- Full `scripts/pnpm.ps1 check`: `20 files / 119 tests passed`; TypeScript and Vite build passed.
- Full `scripts/pnpm.ps1 test:e2e`: `18 passed` across installed Chrome and installed Edge channels.

## Final browser measurements (1920 x 1080, high profile)

| Browser | Version | GPU renderer | Triangles | Texture bytes | Initial load | All modules | Median orbit FPS | Min full-explosion FPS |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Chrome | 152.0.7977.64 | ANGLE / Intel Arc / D3D11 | 223,099 | 314,572,800 | 931.620 ms | 758.538 ms | 59.524 | 39.841 |
| Edge | 151.0.4129.107 | ANGLE / Intel Arc / D3D11 | 223,099 | 314,572,800 | 821.594 ms | 1,328.235 ms | 59.880 | 40.000 |

The Codex live-browser extension bindings were unavailable for both families, but the repository's Playwright configuration successfully launched the installed Chrome and Edge browser channels and accessed their WebGL2 GPU renderer strings. No browser/GPU value was fabricated.

## Visual inspection

Inspected `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-15-quality-low-high.png` at original 1920 x 1080 resolution. The quality control is legible, the selected ghost state remains active after low/high replacement, the model remains framed, and no panel clipping or compatibility-message overlap is visible.

The full E2E suite regenerated older Task 11-14 screenshots during verification; those unrelated binary changes were restored to their prior committed versions.

## Files

- `src/viewer/qualityController.ts`
- `src/viewer/moduleLoader.ts`
- `src/viewer/createRenderer.ts`
- `src/viewer/partDisplayController.ts`
- `src/app/createApp.ts`
- `src/ui/assemblyTree.ts`
- `src/main.ts`
- `src/styles/app.css`
- `playwright.config.ts`
- `tests/unit/qualityController.test.ts`
- `tests/unit/rendererRecovery.test.ts`
- `tests/unit/moduleLoader.test.ts`
- `tests/unit/partDisplayController.test.ts`
- `tests/e2e/task15-quality-recovery.spec.ts`
- `tests/e2e/task15-performance.spec.ts`
- `artifacts/validation/performance.json`

## Final validation commands

```text
scripts/pnpm.ps1 check
scripts/pnpm.ps1 test:e2e
node -e <performance schema/content assertions>
git diff --check
```

`pnpm check` retains Vite's pre-existing advisory that the main bundle is larger than 500 kB; it is not a build failure.
