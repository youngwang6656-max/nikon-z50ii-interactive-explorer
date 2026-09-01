const environment = (globalThis as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

export const evidenceDir = environment?.Z50II_REFRESH_EVIDENCE === '1'
  ? '.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model'
  : 'runtime-results/e2e/screenshots';

export const performancePath = environment?.Z50II_REFRESH_EVIDENCE === '1'
  ? 'artifacts/validation/performance.json'
  : 'runtime-results/e2e/performance.json';
