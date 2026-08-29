import { describe, expect, it } from 'vitest';

import fixture from '../../public/assembly-manifest.json';
import { createAssemblyState } from '../../src/domain/assemblyState';
import { parseManifest } from '../../src/domain/manifest';
import { filterAssemblyParts, visibleAssemblyPartIds } from '../../src/ui/assemblyTree';
import { createInspectorViewModel } from '../../src/ui/inspector';

const manifest = parseManifest(fixture);

describe('selection UI models', () => {
  it('filters all 100 parts by ID, Chinese name, or English name', () => {
    expect(filterAssemblyParts(manifest.parts, '')).toHaveLength(100);
    expect(filterAssemblyParts(manifest.parts, 'Z50II-03-009').map((part) => part.partId)).toEqual([
      'Z50II-03-009',
    ]);
    expect(filterAssemblyParts(manifest.parts, '传感器').length).toBeGreaterThan(0);
    expect(filterAssemblyParts(manifest.parts, 'sensor').length).toBeGreaterThan(0);
  });

  it('builds bilingual inspector details with dependency names and assembly progress', () => {
    const state = createAssemblyState(manifest);
    const part = manifest.parts.find((candidate) => candidate.dependsOn.length > 0)!;
    state.progress[part.partId] = 0.375;

    const model = createInspectorViewModel(manifest, state, part.partId);

    expect(model?.nameZh).toBe(part.nameZh);
    expect(model?.nameEn).toBe(part.nameEn);
    expect(model?.progressLabel).toBe('38%');
    expect(model?.progressValue).toBe(0.375);
    expect(model?.dependencies).toEqual(
      part.dependsOn.map((partId) => {
        const dependency = manifest.parts.find((candidate) => candidate.partId === partId)!;
        return `${dependency.nameZh} / ${dependency.nameEn}`;
      }),
    );
    expect(model?.missingDependencies).toEqual(
      part.dependsOn.map((partId) => {
        const dependency = manifest.parts.find((candidate) => candidate.partId === partId)!;
        return { partId, nameZh: dependency.nameZh };
      }),
    );

    part.dependsOn.forEach((partId) => { state.progress[partId] = 1; });
    expect(createInspectorViewModel(manifest, state, part.partId)?.missingDependencies).toEqual([]);
  });

  it('keeps a canvas-selected row visible outside the active search filter', () => {
    const selected = manifest.parts.find((part) => !part.nameZh.includes('传感器') && !part.nameEn.toLowerCase().includes('sensor'))!;
    const visible = visibleAssemblyPartIds(manifest.parts, '传感器', selected.partId);

    expect(visible.has(selected.partId)).toBe(true);
    expect(visible.size).toBeGreaterThan(1);
  });
});
