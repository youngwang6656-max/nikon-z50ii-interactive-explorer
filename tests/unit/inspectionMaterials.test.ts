import { Color, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import { calibrateInspectionMaterials } from '../../src/viewer/createRenderer';

describe('inspection material calibration', () => {
  it('restrains sensor highlights for physical and standard GLTF materials without changing metal roles', () => {
    const root = new Group();
    const sensor = new MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.12,
      roughness: 0.055,
      clearcoat: 0.35,
      transmission: 0.12,
    });
    sensor.userData.materialRole = 'sensor_glass';
    const metal = new MeshStandardMaterial({ roughness: 0.22 });
    metal.userData.materialRole = 'mount_metal';
    const standardSensor = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.12,
      roughness: 0.055,
    });
    standardSensor.name = 'sensor_glass';
    root.add(
      new Mesh(undefined, sensor),
      new Mesh(undefined, standardSensor),
      new Mesh(undefined, metal),
    );

    calibrateInspectionMaterials(root);

    expect(sensor.color).toEqual(new Color(0x082c36));
    expect(sensor.metalness).toBe(0);
    expect(sensor.roughness).toBeGreaterThanOrEqual(0.7);
    expect(sensor.envMapIntensity).toBe(0);
    expect(sensor.clearcoat).toBe(0);
    expect(sensor.transmission).toBe(0);
    expect(sensor.specularIntensity).toBe(0);
    expect(sensor.iridescence).toBe(0);
    expect(standardSensor.color).toEqual(new Color(0x082c36));
    expect(standardSensor.roughness).toBeGreaterThanOrEqual(0.7);
    expect(standardSensor.envMapIntensity).toBe(0);
    expect(metal.roughness).toBe(0.22);
  });
});
