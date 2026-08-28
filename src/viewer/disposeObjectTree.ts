import { Material, Mesh, Object3D, Texture } from 'three';

const disposedGeometries = new WeakSet<object>();
const disposedMaterials = new WeakSet<object>();
const disposedTextures = new WeakSet<object>();

function disposeOnce(
  resource: { dispose(): void },
  disposed: WeakSet<object>,
): void {
  if (disposed.has(resource)) return;
  disposed.add(resource);
  resource.dispose();
}

export function disposeObjectTree(root: Object3D): void {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });

  textures.forEach((texture) => disposeOnce(texture, disposedTextures));
  materials.forEach((material) => disposeOnce(material, disposedMaterials));
  geometries.forEach((geometry) => disposeOnce(geometry, disposedGeometries));
}
