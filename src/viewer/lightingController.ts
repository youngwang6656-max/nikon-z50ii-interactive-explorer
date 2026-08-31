import {
  AmbientLight,
  DirectionalLight,
  Group,
  Light,
  Mesh,
  Object3D,
  Scene,
  ShadowMaterial,
} from 'three';

import { VisibilityController } from './visibilityController';

export type LightingPreset = 'studio' | 'inspection';

export interface ExposureRenderer {
  toneMappingExposure: number;
}

interface ObjectVisibilitySnapshot {
  object: Object3D;
  visible: boolean;
}

interface ShadowOpacitySnapshot {
  material: ShadowMaterial;
  opacity: number;
}

export class LightingController {
  private readonly originalExposure: number;
  private readonly originalEnvironmentIntensity: number;
  private readonly replacedLights: ObjectVisibilitySnapshot[];
  private readonly shadowMaterials: ShadowOpacitySnapshot[] = [];
  private readonly rig = new Group();
  private readonly ambient = new AmbientLight(0xa9c8df, 0.12);
  private readonly key = new DirectionalLight(0xe8f3ff, 0.75);
  private readonly fill = new DirectionalLight(0x91b9d2, 0.3);
  private readonly rim = new DirectionalLight(0xffddb4, 0.5);
  private currentPreset: LightingPreset = 'studio';
  private qualityEnvironmentIntensity = 1;
  private disposed = false;

  constructor(
    private readonly renderer: ExposureRenderer,
    private readonly scene: Scene,
    private readonly visibility: VisibilityController,
  ) {
    this.originalExposure = renderer.toneMappingExposure;
    this.originalEnvironmentIntensity = scene.environmentIntensity;
    this.replacedLights = scene.children
      .filter((object) => object.userData.ownedByLightingController !== true && object.type.endsWith('Light'))
      .map((object) => ({ object, visible: object.visible }));
    this.replacedLights.forEach(({ object }) => { object.visible = false; });

    this.rig.name = 'Z50II_LIGHTING_RIG';
    this.rig.userData.ownedByLightingController = true;
    this.ambient.name = 'Z50II_STUDIO_AMBIENT';
    this.key.name = 'Z50II_STUDIO_KEY';
    this.fill.name = 'Z50II_STUDIO_FILL';
    this.rim.name = 'Z50II_STUDIO_RIM';
    this.key.position.set(0.2, 0.28, 0.18);
    this.fill.position.set(-0.22, 0.12, 0.12);
    this.rim.position.set(0.04, 0.2, -0.24);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 0.04;
    this.key.shadow.camera.far = 1.4;
    this.rig.add(this.ambient, this.key, this.fill, this.rim);
    scene.add(this.rig);

    scene.traverse((object) => {
      if (!(object instanceof Mesh) || object.name !== 'TECHNICAL_SHADOW_FLOOR') return;
      const candidates = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of candidates) {
        if (material instanceof ShadowMaterial) {
          this.shadowMaterials.push({ material, opacity: material.opacity });
        }
      }
    });
    this.applyPreset();
  }

  get preset(): LightingPreset {
    return this.currentPreset;
  }

  setPreset(preset: LightingPreset): void {
    if (this.disposed || this.currentPreset === preset) return;
    this.currentPreset = preset;
    this.applyPreset();
  }

  setQualityEnvironmentIntensity(intensity: number): void {
    if (this.disposed) return;
    const normalized = Math.max(0, intensity);
    if (this.qualityEnvironmentIntensity === normalized) return;
    this.qualityEnvironmentIntensity = normalized;
    this.applyPreset();
  }

  refresh(): void {
    if (!this.disposed) this.visibility.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.visibility.setInspectionMode(false);
    this.renderer.toneMappingExposure = this.originalExposure;
    this.scene.environmentIntensity = this.originalEnvironmentIntensity;
    this.shadowMaterials.forEach(({ material, opacity }) => { material.opacity = opacity; });
    this.replacedLights.forEach(({ object, visible }) => { object.visible = visible; });
    this.scene.remove(this.rig);
    this.rig.traverse((object) => {
      if (object instanceof Light) object.dispose();
    });
    this.disposed = true;
  }

  private applyPreset(): void {
    const inspection = this.currentPreset === 'inspection';
    this.renderer.toneMappingExposure = inspection
      ? Math.min(0.8, this.originalExposure * 1.2)
      : this.originalExposure;
    this.scene.environmentIntensity = (inspection ? 0.12 : 0.22)
      * this.qualityEnvironmentIntensity;
    this.ambient.intensity = inspection ? 0.42 : 0.12;
    this.key.intensity = inspection ? 0.55 : 0.75;
    this.fill.intensity = inspection ? 0.45 : 0.3;
    this.rim.intensity = inspection ? 0.3 : 0.5;
    this.shadowMaterials.forEach(({ material, opacity }) => {
      material.opacity = inspection ? Math.min(opacity, 0.16) : opacity;
    });
    this.visibility.setInspectionMode(inspection);
  }
}
