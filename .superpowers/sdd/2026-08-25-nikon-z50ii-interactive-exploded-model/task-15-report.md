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

---

## Independent review remediation (2026-08-30)

This section supersedes the earlier performance figures and records the fixes made after the independent Task 15 review.

### Findings closed

- Retry is now explicitly keyed by both module and requested quality. An adversarial unit test fails high and low independently, retries high, and proves low remains failed with no cross-profile recovery.
- Failed-texture fallback now neutralizes every Three.js material exposing a `Color`, including unlit `MeshBasicMaterial`. The test also proves an unrelated magenta material is untouched.
- Lighting preset intensity and quality intensity now compose in `LightingController`; renderer profile application no longer overwrites the environment. The unit test covers studio/inspection under low (`0.55`) and high (`1.0`) quality.
- WebGL2 null contexts, `getContext` exceptions, and `WebGLRenderer` construction exceptions converge on the same Chinese Chrome/Edge compatibility alert with no remaining canvas or secondary startup crash.
- Mounted quality and requested quality are distinct assembly-tree states. A failed low replacement retains the mounted high root, full 4x4 selected transform, inspector, and `8 / 8` loaded progress until the scoped retry succeeds.
- Selected transform evidence now publishes all 16 matrix elements. Task 13 and Task 15 E2E assertions verify the translation components change under disassembly while the rotation/scale basis remains stable, and survive quality replacement exactly.
- Performance evidence is generated directly by `task15-performance.spec.ts`. Each installed browser runs three repetitions at 1920 x 1080: one fresh-context HTTP-cache run and two same-context warm-cache runs. The report explicitly notes that the preview server and OS file cache may already be warm.
- Orbit FPS is movement-gated: 180 primary-button pointer moves use a 10 ms minimum pacing delay across the interval; rAF frames are retained only while dragging and within 100 ms of the latest move. Actual input duration, move count, and retained movement-frame count are recorded per run; post-input stationary frames are excluded.

### Review TDD evidence

RED evidence captured before production fixes:

- Focused unit review suite: `4 failed` for missing quality-scoped retry, invalid-quality retry validation, unlit material neutralization, and lighting/quality composition.
- Focused Chrome recovery suite: `4 failed / 3 passed` for the 12-element transform, falsely advanced mounted-quality label, thrown `getContext`, and thrown renderer construction.
- First rebuilt full-browser attempt: Task 13 exposed its prior 12-element orientation-only assumption after the production transform evidence expanded to 16 elements. Its corrected assertion now proves stable rotation/scale and changed translation.

GREEN evidence:

- `pnpm check`: `20` test files, `122 / 122` unit tests passed; TypeScript passed; Vite production build passed.
- Focused rebuilt Chrome recovery: `7 / 7` passed.
- Focused rebuilt Chrome Task 13 transform coverage: `1 / 1` passed.
- Final rebuilt installed-browser E2E: `24 / 24` passed across Chrome and Edge in `4.0m`.
- `git diff --check`: passed (only Git line-ending advisories were emitted).

### Regenerated measured performance (1920 x 1080, high profile)

These values come from `artifacts/validation/performance.json` generated by the final passing two-browser E2E run. Load and orbit summary values are medians of three runs; the explosion value is the minimum seen across all three repetitions.

| Browser | Version | GPU renderer | Triangles | Texture bytes | Initial load | All modules | Median moving-orbit FPS | Min full-explosion FPS |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Chrome | 152.0.7977.64 | ANGLE / Intel Arc / D3D11 | 223,099 | 314,572,800 | 2,088.852 ms | 1,262.162 ms | 40.000 | 29.851 |
| Edge | 151.0.4129.107 | ANGLE / Intel Arc / D3D11 | 223,099 | 314,572,800 | 1,397.270 ms | 1,216.945 ms | 40.161 | 23.981 |

Chrome retained `384-441` movement frames per repetition from `180` pointer moves over `9,549.2-10,762.1 ms`; Edge retained `619-651` movement frames over `13,003.1-13,910.5 ms`. These are measured values, not hand-copied estimates.

### Review visual inspection

- `task-15-quality-low-high.png` (1920 x 1080): inspected at original resolution; high quality is mounted after the low/high transaction, the selected screw remains at 50%, the ghost control remains active, the inspector stays populated, and no panel overlaps the viewer.
- `task-15-failed-low-retains-high.png` (1920 x 1080): inspected at original resolution; the low request visibly reports a recoverable load failure and retry control while the high-detail model, selected part, 50% transform, and inspector remain present.
- The final E2E run regenerated Task 11-14 screenshots; those unrelated binary changes were restored to their committed versions.
