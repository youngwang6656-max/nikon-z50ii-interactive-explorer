import { PerspectiveCamera, Vector3 } from 'three';

export interface CameraControlsLike {
  readonly target: Vector3;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}
export interface CameraPresetTweenOptions {
  durationMs?: number;
  reducedMotion?: boolean;
}

const PRESET_OFFSETS = {
  front: [0, 0.04, 0.25],
  rear: [0, 0.04, -0.25],
  left: [-0.25, 0.04, 0],
  right: [0.25, 0.04, 0],
  top: [0, 0.25, 0.02],
  bottom: [0, -0.25, 0.02],
  'three-quarter': [0.165, 0.115, 0.205],
} as const;

const DEFAULT_DURATION_MS = 480;

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

export class CameraPresetTween {
  private readonly durationMs: number;
  private readonly reducedMotion: boolean;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private elapsedMs = 0;
  private running = false;
  private disposed = false;

  private readonly cancelForUserOrbit = (): void => {
    this.cancel();
  };

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly controls: CameraControlsLike,
    options: CameraPresetTweenOptions = {},
  ) {
    this.durationMs = Number.isFinite(options.durationMs) && (options.durationMs ?? 0) > 0
      ? options.durationMs!
      : DEFAULT_DURATION_MS;
    this.reducedMotion = options.reducedMotion ?? false;
    controls.addEventListener('start', this.cancelForUserOrbit);
  }

  get active(): boolean {
    return this.running;
  }

  start(presetName: string): void {
    if (this.disposed) return;
    const offset = PRESET_OFFSETS[presetName as keyof typeof PRESET_OFFSETS]
      ?? PRESET_OFFSETS['three-quarter'];
    this.from.copy(this.camera.position);
    this.to.copy(this.controls.target).add(new Vector3(...offset));
    this.elapsedMs = 0;

    if (this.reducedMotion) {
      this.camera.position.copy(this.to);
      this.camera.lookAt(this.controls.target);
      this.running = false;
      return;
    }
    this.running = !this.from.equals(this.to);
  }

  tick(milliseconds: number): void {
    if (!this.running || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
    this.elapsedMs = Math.min(this.durationMs, this.elapsedMs + milliseconds);
    const progress = this.elapsedMs / this.durationMs;
    this.camera.position.lerpVectors(this.from, this.to, easeInOutCubic(progress));
    this.camera.lookAt(this.controls.target);
    if (progress >= 1) this.running = false;
  }

  cancel(): void {
    this.running = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.controls.removeEventListener('start', this.cancelForUserOrbit);
    this.disposed = true;
  }
}
