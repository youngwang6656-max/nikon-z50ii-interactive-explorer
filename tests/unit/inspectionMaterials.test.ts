import { Color, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import { calibrateInspectionMaterials } from '../../src/viewer/createRenderer';

describe('inspection material calibration', () => {
  it('restrains sensor and reflective metal highlights while leaving unrelated materials unchanged', () => {
    const root = new Group();
    const sensor = new MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.12,
      roughness: 0.055,
      clearcoat: 0.35,
      transmission: 0.12,
    });
    sensor.userData.materialRole = 'sensor_glass';
    const metal = new MeshStandardMaterial({ color: 0x708090, roughness: 0.22 });
    metal.userData.materialRole = 'mount_metal';
    const shield = new MeshStandardMaterial({ color: 0x505860, roughness: 0.3 });
    shield.name = 'brushed_shield';
    const unrelated = new MeshStandardMaterial({ color: 0x222222, roughness: 0.2 });
    const standardSensor = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.12,
      roughness: 0.055,
    });
    standardSensor.name = 'sensor_glass';
    const exportedSensor = new MeshStandardMaterial({
      color: 0xf5ffff,
      metalness: 0.34,
      roughness: 0.12,
    });
    exportedSensor.name = 'Z50II DX Sensor';
    root.add(
      new Mesh(undefined, sensor),
      new Mesh(undefined, standardSensor),
      new Mesh(undefined, metal),
      new Mesh(undefined, shield),
      new Mesh(undefined, unrelated),
      new Mesh(undefined, exportedSensor),
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
    expect(exportedSensor.color).toEqual(new Color(0x082c36));
    expect(exportedSensor.metalness).toBe(0);
    expect(exportedSensor.roughness).toBeGreaterThanOrEqual(0.7);
    expect(exportedSensor.envMapIntensity).toBe(0);
    expect(metal.color.r).toBeLessThan(new Color(0x708090).r * 0.3);
    expect(metal.roughness).toBeGreaterThanOrEqual(0.8);
    expect(metal.envMapIntensity).toBeLessThanOrEqual(0.08);
    expect(shield.color.r).toBeLessThan(new Color(0x505860).r * 0.3);
    expect(shield.roughness).toBeGreaterThanOrEqual(0.8);
    expect(shield.envMapIntensity).toBeLessThanOrEqual(0.08);
    expect(unrelated.color).toEqual(new Color(0x222222));
    expect(unrelated.roughness).toBe(0.2);
  });
});
