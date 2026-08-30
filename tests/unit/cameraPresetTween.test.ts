import { BoxGeometry, EventDispatcher, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { CameraPresetTween } from '../../src/viewer/cameraPresetTween';

class FakeControls extends EventDispatcher<{ start: object }> {
  readonly target = new Vector3(0.01, -0.02, 0.03);
}

describe('camera preset tween', () => {
  it('tweens deterministically to meter-scale presets without changing the controls target', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0.165, 0.115, 0.205);
    const controls = new FakeControls();
    const targetBefore = controls.target.clone();
    const tween = new CameraPresetTween(camera, controls, { durationMs: 400 });

    tween.start('rear');
    tween.tick(100);
    const quarterPosition = camera.position.clone();
    tween.tick(300);

    expect(quarterPosition.equals(camera.position)).toBe(false);
    expect(camera.position.x).toBeCloseTo(0.01, 12);
    expect(camera.position.y).toBeCloseTo(0.02, 12);
    expect(camera.position.z).toBeCloseTo(-0.22, 12);
    expect(controls.target.equals(targetBefore)).toBe(true);
    expect(tween.active).toBe(false);
  });

  it('cancels safely when the user starts orbiting or a replacement tween starts', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0.1, 0.1, 0.1);
    const controls = new FakeControls();
    const tween = new CameraPresetTween(camera, controls, { durationMs: 100 });

    tween.start('front');
    tween.tick(40);
    tween.start('left');
    controls.dispatchEvent({ type: 'start' });
    const cancelledPosition = camera.position.clone();
    tween.tick(100);

    expect(camera.position.equals(cancelledPosition)).toBe(true);
    expect(tween.active).toBe(false);
    tween.dispose();
    controls.dispatchEvent({ type: 'start' });
  });

  it('applies immediately when reduced motion is requested and ignores starts after disposal', () => {
    const camera = new PerspectiveCamera();
    const controls = new FakeControls();
    const tween = new CameraPresetTween(camera, controls, { reducedMotion: true });

    tween.start('top');
    expect(camera.position.toArray()).toEqual([0.01, 0.23, 0.05]);
    expect(tween.active).toBe(false);

    tween.dispose();
    const disposedPosition = camera.position.clone();
    tween.start('bottom');
    expect(camera.position.equals(disposedPosition)).toBe(true);
  });

  it('fits six presets to current visible bounds and updates the OrbitControls target', () => {
    const camera = new PerspectiveCamera(40, 0.5, 0.01, 10);
    const controls = new FakeControls();
    const visible = new Mesh(new BoxGeometry(0.2, 0.1, 0.08));
    visible.position.set(0.04, 0.02, -0.03);
    visible.updateMatrixWorld(true);
    const tween = new CameraPresetTween(camera, controls, {
      reducedMotion: true,
      getVisibleObjects: () => [visible],
    });

    for (const preset of ['front', 'rear', 'left', 'right', 'top', 'three-quarter']) {
      tween.start(preset);
      expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(0.2);
      expect(camera.position.distanceTo(controls.target)).toBeLessThan(2);
    }
    expect(controls.target.x).toBeCloseTo(0.04, 12);
    expect(controls.target.y).toBeCloseTo(0.02, 12);
    expect(controls.target.z).toBeCloseTo(-0.03, 12);
  });

  it.each([0.4, 1, 2.4])(
    'keeps every visible bound corner inside NDC for aspect %s',
    (aspect) => {
      const camera = new PerspectiveCamera(40, aspect, 0.01, 10);
      const controls = new FakeControls();
      const visible = new Mesh(new BoxGeometry(0.2, 0.1, 0.08));
      visible.position.set(0.04, 0.02, -0.03);
      visible.updateMatrixWorld(true);
      const tween = new CameraPresetTween(camera, controls, {
        reducedMotion: true,
        getVisibleObjects: () => [visible],
      });
      const expectedDirections = {
        front: new Vector3(0, 0.04, 0.25).normalize(),
        rear: new Vector3(0, 0.04, -0.25).normalize(),
        left: new Vector3(-0.25, 0.04, 0).normalize(),
        right: new Vector3(0.25, 0.04, 0).normalize(),
        top: new Vector3(0, 0.25, 0.02).normalize(),
        'three-quarter': new Vector3(0.165, 0.115, 0.205).normalize(),
      };

      for (const [preset, expectedDirection] of Object.entries(expectedDirections)) {
        tween.start(preset);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        const actualDirection = camera.position.clone().sub(controls.target).normalize();
        expect(actualDirection.dot(expectedDirection)).toBeGreaterThan(0.999999);
        for (const x of [-0.1, 0.1]) {
          for (const y of [-0.05, 0.05]) {
            for (const z of [-0.04, 0.04]) {
              const ndc = new Vector3(0.04 + x, 0.02 + y, -0.03 + z).project(camera);
              expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
              expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
              expect(ndc.z).toBeGreaterThanOrEqual(-1);
              expect(ndc.z).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    },
  );
});
