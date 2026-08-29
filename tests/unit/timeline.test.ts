import { describe, expect, it } from 'vitest';

import productionManifestFixture from '../../public/assembly-manifest.json';
import { createAssemblyState } from '../../src/domain/assemblyState';
import { GuidedSequence } from '../../src/domain/guidedSequence';
import { parseManifest } from '../../src/domain/manifest';
import { createTimelineViewModel } from '../../src/ui/timeline';

const manifest = parseManifest(productionManifestFixture);

describe('timeline view model', () => {
  it('presents Chinese-first current-step copy and padded progress counts', () => {
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));
    sequence.seek(2.5 / 40);

    expect(createTimelineViewModel(sequence.snapshot(), manifest.steps.length)).toEqual({
      title: `拆卸：${manifest.steps[2]!.titleZh.replace(/^拆卸：/, '')}`,
      subtitle: manifest.steps[2]!.titleEn,
      count: '02 / 40',
      progressPercent: 6.25,
      playLabel: '播放拆解序列',
      playText: '播放',
    });
  });

  it('shows pause controls while playback is active', () => {
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));
    sequence.play();
    const model = createTimelineViewModel(sequence.snapshot(), manifest.steps.length);
    expect(model.playLabel).toBe('暂停拆解序列');
    expect(model.playText).toBe('暂停');
  });
});
