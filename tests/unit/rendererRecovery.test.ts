import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  collectSceneMetrics,
  loadEnvironmentWithFallback,
} from '../../src/viewer/createRenderer';

describe('renderer recovery', () => {
  it('keeps neutral RoomEnvironment active when optional HDR loading fails', async () => {
    const fallback = vi.fn();
    const apply = vi.fn();

    await expect(loadEnvironmentWithFallback(
      async () => { throw new Error('missing HDR'); },
      apply,
      fallback,
    )).resolves.toBeUndefined();

    expect(apply).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith('missing HDR');
  });

  it('applies and disposes an HDR source without invoking fallback', async () => {
    const source = new Texture();
    const dispose = vi.spyOn(source, 'dispose');
    const scene = new Scene();
    const apply = vi.fn(() => { scene.userData.environment = 'hdr'; });
    const fallback = vi.fn();

    await loadEnvironmentWithFallback(async () => source, apply, fallback);

    expect(apply).toHaveBeenCalledWith(source);
    expect(dispose).toHaveBeenCalledOnce();
    expect(scene.userData.environment).toBe('hdr');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('counts rendered triangles and unique decoded texture bytes', () => {
    const scene = new Scene();
    const texture = new Texture({ width: 10, height: 5 });
    const material = new MeshStandardMaterial({ map: texture });
    scene.add(
      new Mesh(new BoxGeometry(1, 1, 1), material),
      new Mesh(new BoxGeometry(1, 1, 1), material),
    );

    expect(collectSceneMetrics(scene)).toEqual({
      triangles: 24,
      textureBytes: 200,
      textureBytesUnavailableReason: null,
    });
  });
});
