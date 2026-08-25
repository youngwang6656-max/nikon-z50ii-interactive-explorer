import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/assembly-manifest.valid.json';
import { parseManifest, validateManifest } from '../../src/domain/manifest';

describe('manifest contract', () => {
  it('parses the valid fixture', () => {
    const manifest = parseManifest(fixture);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.parts).toHaveLength(2);
  });

  it.each(['duplicate-id', 'missing-dependency', 'non-unit-axis', 'dependency-cycle'])
  ('rejects %s', (kind) => {
    const broken = structuredClone(fixture);
    const first = broken.parts[0]!;
    const second = broken.parts[1]!;
    if (kind === 'duplicate-id') second.partId = first.partId;
    if (kind === 'missing-dependency') second.dependsOn = ['missing'];
    if (kind === 'non-unit-axis') first.explodeAxis = [2, 0, 0];
    if (kind === 'dependency-cycle') {
      first.dependsOn = [second.partId];
      second.dependsOn = [first.partId];
    }
    expect(validateManifest(broken).map((issue) => issue.code)).toContain(kind);
  });
});
