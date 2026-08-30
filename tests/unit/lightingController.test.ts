import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import { LightingController } from '../../src/viewer/lightingController';
import { VisibilityController } from '../../src/viewer/visibilityController';

describe('LightingController', () => {
  it('switches reversible studio/inspection lighting and material reflection state', () => {
    const scene = new Scene();
    scene.environmentIntensity = 0.42;
    const legacy = new AmbientLight(0xffffff, 0.2);
    scene.add(legacy);
    const floorMaterial = new ShadowMaterial({ opacity: 0.47 });
    const floor = new Mesh(new PlaneGeometry(), floorMaterial);
    floor.name = 'TECHNICAL_SHADOW_FLOOR';
    scene.add(floor);
    const shared = new MeshStandardMaterial({ roughness: 0.3 });
    shared.envMapIntensity = 0.9;
    const first = new Mesh(new BoxGeometry(), shared);
    const second = new Mesh(new BoxGeometry(), shared);
    scene.add(first, second);
    const visibility = new VisibilityController([first, second]);
    const renderer = { toneMappingExposure: 0.65 };

    const controller = new LightingController(renderer, scene, visibility);

    expect(controller.preset).toBe('studio');
    expect(renderer.toneMappingExposure).toBe(1);
    const studioEnvironmentIntensity = scene.environmentIntensity;
    expect(legacy.visible).toBe(false);
    expect(scene.getObjectByName('Z50II_STUDIO_KEY')).not.toBeNull();
    expect(scene.getObjectByName('Z50II_STUDIO_FILL')).not.toBeNull();
    expect(scene.getObjectByName('Z50II_STUDIO_RIM')).not.toBeNull();
    expect(first.material).toBe(shared);
    expect(floorMaterial.opacity).toBe(0.47);

    controller.setPreset('inspection');

    expect(controller.preset).toBe('inspection');
    expect(renderer.toneMappingExposure).toBe(1.15);
    expect(scene.environmentIntensity).toBeLessThan(studioEnvironmentIntensity);
    expect(floorMaterial.opacity).toBe(0.16);
    expect(first.material).not.toBe(shared);
    expect(second.material).not.toBe(shared);
    expect((first.material as MeshStandardMaterial).envMapIntensity).toBeLessThan(0.9);
    expect(shared.envMapIntensity).toBe(0.9);

    controller.setPreset('studio');

    expect(renderer.toneMappingExposure).toBe(1);
    expect(floorMaterial.opacity).toBe(0.47);
    expect(first.material).toBe(shared);
    expect(second.material).toBe(shared);

    controller.dispose();
    expect(renderer.toneMappingExposure).toBe(0.65);
    expect(scene.environmentIntensity).toBe(0.42);
    expect(legacy.visible).toBe(true);
    expect(scene.getObjectByName('Z50II_STUDIO_KEY')).toBeUndefined();
  });

  it('disposes every owned light and the key shadow render targets exactly once', () => {
    const scene = new Scene();
    const visibility = new VisibilityController([]);
    const controller = new LightingController({ toneMappingExposure: 1 }, scene, visibility);
    const directionalLights = [
      'Z50II_STUDIO_KEY',
      'Z50II_STUDIO_FILL',
      'Z50II_STUDIO_RIM',
    ].map((name) => scene.getObjectByName(name) as DirectionalLight);
    const lightDisposals = directionalLights.map(() => vi.fn());
    directionalLights.forEach((light, index) => {
      light.addEventListener('dispose', lightDisposals[index]!);
    });
    const shadowMapDispose = vi.fn();
    const shadowMapPassDispose = vi.fn();
    directionalLights[0]!.shadow.map = {
      dispose: shadowMapDispose,
    } as unknown as NonNullable<typeof directionalLights[0]['shadow']['map']>;
    directionalLights[0]!.shadow.mapPass = {
      dispose: shadowMapPassDispose,
    } as unknown as NonNullable<typeof directionalLights[0]['shadow']['mapPass']>;

    controller.dispose();
    controller.dispose();

    lightDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(shadowMapDispose).toHaveBeenCalledTimes(1);
    expect(shadowMapPassDispose).toHaveBeenCalledTimes(1);
  });
});
