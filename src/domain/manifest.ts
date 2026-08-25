export type Vec3 = readonly [number, number, number];
export type QualityLevel = 'high' | 'low';

export interface ModuleManifest {
  moduleId: string;
  nameZh: string;
  nameEn: string;
  urls: Record<QualityLevel, string>;
  preload: boolean;
}

export interface PartManifest {
  partId: string;
  moduleId: string;
  parentId: string | null;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  step: number;
  explodeAxis: Vec3;
  explodeDistance: number;
  dependsOn: string[];
  isReferenceGeometry: boolean;
}

export interface DisassemblyStep {
  step: number;
  titleZh: string;
  titleEn: string;
  partIds: string[];
  cameraPreset: string;
}

export interface AssemblyManifest {
  schemaVersion: 1;
  product: { name: 'Nikon Z50II'; disclaimerZh: string; disclaimerEn: string };
  modules: ModuleManifest[];
  parts: PartManifest[];
  steps: DisassemblyStep[];
}

export interface ValidationIssue {
  code: 'shape' | 'duplicate-id' | 'missing-dependency' | 'non-unit-axis' | 'dependency-cycle';
  path: string;
  message: string;
}

type ManifestRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ManifestRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export function validateManifest(raw: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const addIssue = (code: ValidationIssue['code'], path: string, message: string): void => {
    issues.push({ code, path, message });
  };
  const requireString = (value: unknown, path: string): value is string => {
    if (typeof value !== 'string') addIssue('shape', path, 'must be a string');
    return typeof value === 'string';
  };
  const requireBoolean = (value: unknown, path: string): value is boolean => {
    if (typeof value !== 'boolean') addIssue('shape', path, 'must be a boolean');
    return typeof value === 'boolean';
  };
  const requireArray = (value: unknown, path: string): value is unknown[] => {
    if (!Array.isArray(value)) addIssue('shape', path, 'must be an array');
    return Array.isArray(value);
  };

  if (!isRecord(raw)) {
    addIssue('shape', '$', 'manifest must be an object');
    return issues;
  }

  if (raw.schemaVersion !== 1) addIssue('shape', 'schemaVersion', 'must equal 1');

  if (!isRecord(raw.product)) {
    addIssue('shape', 'product', 'must be an object');
  } else {
    if (raw.product.name !== 'Nikon Z50II') addIssue('shape', 'product.name', 'must equal Nikon Z50II');
    requireString(raw.product.disclaimerZh, 'product.disclaimerZh');
    requireString(raw.product.disclaimerEn, 'product.disclaimerEn');
  }

  const modules = requireArray(raw.modules, 'modules') ? raw.modules : [];
  const parts = requireArray(raw.parts, 'parts') ? raw.parts : [];
  const steps = requireArray(raw.steps, 'steps') ? raw.steps : [];
  const moduleIds = new Set<string>();
  const partIds = new Set<string>();
  const partRecords: Array<{ path: string; value: ManifestRecord }> = [];

  modules.forEach((module, index) => {
    const path = `modules[${index}]`;
    if (!isRecord(module)) {
      addIssue('shape', path, 'must be an object');
      return;
    }
    if (requireString(module.moduleId, `${path}.moduleId`)) {
      if (moduleIds.has(module.moduleId)) addIssue('duplicate-id', `${path}.moduleId`, `duplicate ID ${module.moduleId}`);
      moduleIds.add(module.moduleId);
    }
    requireString(module.nameZh, `${path}.nameZh`);
    requireString(module.nameEn, `${path}.nameEn`);
    requireBoolean(module.preload, `${path}.preload`);
    if (!isRecord(module.urls)) {
      addIssue('shape', `${path}.urls`, 'must be an object');
    } else {
      requireString(module.urls.high, `${path}.urls.high`);
      requireString(module.urls.low, `${path}.urls.low`);
    }
  });

  parts.forEach((part, index) => {
    const path = `parts[${index}]`;
    if (!isRecord(part)) {
      addIssue('shape', path, 'must be an object');
      return;
    }
    partRecords.push({ path, value: part });
    if (requireString(part.partId, `${path}.partId`)) {
      if (partIds.has(part.partId)) addIssue('duplicate-id', `${path}.partId`, `duplicate ID ${part.partId}`);
      partIds.add(part.partId);
    }
    requireString(part.moduleId, `${path}.moduleId`);
    if (part.parentId !== null) requireString(part.parentId, `${path}.parentId`);
    requireString(part.nameZh, `${path}.nameZh`);
    requireString(part.nameEn, `${path}.nameEn`);
    requireString(part.descriptionZh, `${path}.descriptionZh`);
    requireString(part.descriptionEn, `${path}.descriptionEn`);
    if (!isInteger(part.step)) addIssue('shape', `${path}.step`, 'must be an integer');
    if (!isFiniteNumber(part.explodeDistance)) addIssue('shape', `${path}.explodeDistance`, 'must be a finite number');
    requireBoolean(part.isReferenceGeometry, `${path}.isReferenceGeometry`);
    if (!isStringArray(part.dependsOn)) addIssue('shape', `${path}.dependsOn`, 'must be an array of strings');

    if (!Array.isArray(part.explodeAxis) || part.explodeAxis.length !== 3 || !part.explodeAxis.every(isFiniteNumber)) {
      addIssue('shape', `${path}.explodeAxis`, 'must be a three-element numeric vector');
    } else {
      const [x, y, z] = part.explodeAxis;
      const length = Math.hypot(x!, y!, z!);
      if (Math.abs(length - 1) > 1e-4) addIssue('non-unit-axis', `${path}.explodeAxis`, 'must have unit length');
    }
  });

  const stepNumbers = new Set<number>();
  steps.forEach((step, index) => {
    const path = `steps[${index}]`;
    if (!isRecord(step)) {
      addIssue('shape', path, 'must be an object');
      return;
    }
    if (!isInteger(step.step)) addIssue('shape', `${path}.step`, 'must be an integer');
    else stepNumbers.add(step.step);
    requireString(step.titleZh, `${path}.titleZh`);
    requireString(step.titleEn, `${path}.titleEn`);
    requireString(step.cameraPreset, `${path}.cameraPreset`);
    if (!isStringArray(step.partIds)) addIssue('shape', `${path}.partIds`, 'must be an array of strings');
  });

  partRecords.forEach(({ path, value: part }) => {
    if (typeof part.moduleId === 'string' && !moduleIds.has(part.moduleId)) {
      addIssue('shape', `${path}.moduleId`, `references unknown module ${part.moduleId}`);
    }
    if (typeof part.parentId === 'string' && !partIds.has(part.parentId)) {
      addIssue('shape', `${path}.parentId`, `references unknown part ${part.parentId}`);
    }
    if (isInteger(part.step) && !stepNumbers.has(part.step)) {
      addIssue('shape', `${path}.step`, `references missing step ${part.step}`);
    }
    if (isStringArray(part.dependsOn)) {
      part.dependsOn.forEach((dependency, dependencyIndex) => {
        if (!partIds.has(dependency)) {
          addIssue('missing-dependency', `${path}.dependsOn[${dependencyIndex}]`, `references unknown part ${dependency}`);
        }
      });
    }
  });

  steps.forEach((step, index) => {
    if (!isRecord(step) || !isStringArray(step.partIds)) return;
    step.partIds.forEach((partId, partIndex) => {
      if (!partIds.has(partId)) addIssue('shape', `steps[${index}].partIds[${partIndex}]`, `references unknown part ${partId}`);
    });
  });

  const dependencies = new Map<string, string[]>();
  partRecords.forEach(({ value: part }) => {
    if (typeof part.partId === 'string' && isStringArray(part.dependsOn)) {
      dependencies.set(part.partId, part.dependsOn.filter((dependency) => partIds.has(dependency)));
    }
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (partId: string): void => {
    if (visited.has(partId)) return;
    if (visiting.has(partId)) {
      addIssue('dependency-cycle', 'parts', `dependency cycle includes ${partId}`);
      return;
    }
    visiting.add(partId);
    dependencies.get(partId)?.forEach(visit);
    visiting.delete(partId);
    visited.add(partId);
  };
  dependencies.forEach((_, partId) => visit(partId));

  return issues;
}

export function parseManifest(raw: unknown): AssemblyManifest {
  const issues = validateManifest(raw);
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join('\n'));
  return raw as AssemblyManifest;
}
