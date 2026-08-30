import type { AssemblyManifest, PartManifest } from '../domain/manifest';
import type { QualityLevel } from '../domain/manifest';
import type { ShellModuleStatus } from './appShell';
import type { QualityMode } from '../viewer/qualityController';

export interface AssemblyTreeCallbacks {
  onSelectPart(partId: string): void | Promise<void>;
  onLoadAll(): void | Promise<void>;
  onRetryModule(moduleId: string): void | Promise<void>;
  onQualityChange(mode: QualityMode): void | Promise<void>;
}

export interface AssemblyTreeController {
  readonly searchInput: HTMLInputElement;
  select(partId: string | null): void;
  setModuleStatus(
    moduleId: string,
    status: ShellModuleStatus,
    error?: string,
    retryCount?: number,
    quality?: QualityLevel,
  ): void;
  setLoadProgress(loaded: number, total: number): void;
  setQuality(mode: QualityMode, effective: QualityLevel): void;
  focusSearch(): void;
  dispose(): void;
}

export function filterAssemblyParts(
  parts: readonly PartManifest[],
  query: string,
): PartManifest[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...parts];
  return parts.filter((part) =>
    [part.partId, part.nameZh, part.nameEn].some((value) =>
      value.toLocaleLowerCase().includes(normalized),
    ),
  );
}

export function visibleAssemblyPartIds(
  parts: readonly PartManifest[],
  query: string,
  selectedPartId: string | null,
): Set<string> {
  const visible = new Set(filterAssemblyParts(parts, query).map((part) => part.partId));
  if (selectedPartId && parts.some((part) => part.partId === selectedPartId)) {
    visible.add(selectedPartId);
  }
  return visible;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountAssemblyTree(
  host: HTMLElement,
  manifest: AssemblyManifest,
  callbacks: AssemblyTreeCallbacks,
): AssemblyTreeController {
  const root = element('div', 'assembly-tree');
  const heading = element('div', 'panel-heading');
  const title = element('h2', 'panel-title', '组件总成');
  title.id = 'assembly-heading';
  heading.append(
    element('span', 'panel-index', '01'),
    title,
    element('span', 'panel-meta', `${manifest.parts.length} PARTS`),
  );

  const tools = element('div', 'tree-tools');
  const search = element('input', 'tree-search');
  search.type = 'search';
  search.placeholder = '搜索 ID / 中文 / English';
  search.setAttribute('aria-label', '搜索相机部件');
  const loadAll = element('button', 'load-all-button', '加载全部模块');
  loadAll.type = 'button';
  loadAll.dataset.testid = 'load-all-modules';
  loadAll.dataset.action = 'load-all';
  loadAll.setAttribute('aria-label', '加载全部八个结构模块');
  const progress = element('span', 'load-progress', `0 / ${manifest.modules.length}`);
  progress.setAttribute('role', 'status');
  const qualityLabel = element('label', 'quality-control');
  qualityLabel.append(element('span', 'quality-label', '质量'));
  const quality = element('select', 'quality-select');
  quality.dataset.testid = 'quality-profile';
  quality.setAttribute('aria-label', '显示质量');
  for (const [value, label] of [
    ['auto', '自动'],
    ['high', '高'],
    ['low', '低'],
  ] as const) {
    const option = element('option', '', label);
    option.value = value;
    quality.append(option);
  }
  const qualityEffective = element('span', 'quality-effective', '当前：高');
  qualityEffective.dataset.testid = 'quality-effective';
  qualityLabel.append(quality, qualityEffective);
  tools.append(search, qualityLabel, loadAll, progress);

  const list = element('div', 'module-list');
  let selectedPartId: string | null = null;
  const partButtons = new Map<string, HTMLButtonElement>();
  const moduleRows = new Map<string, HTMLDetailsElement>();
  for (const [index, module] of manifest.modules.entries()) {
    const details = element('details', 'module-group');
    details.dataset.moduleId = module.moduleId;
    details.dataset.status = 'idle';
    details.open = index < 2;
    const summary = element('summary', 'module-summary');
    const indicator = element('span', 'module-indicator');
    indicator.setAttribute('aria-hidden', 'true');
    const names = element('span', 'module-copy');
    names.append(
      element('strong', 'module-name-zh', module.nameZh),
      element('span', 'module-name-en', module.nameEn),
    );
    const moduleStatus = element('span', 'module-status', '未加载');
    summary.append(indicator, names, moduleStatus);
    summary.setAttribute('aria-label', `${module.nameZh}，${module.nameEn}，未加载`);
    details.setAttribute('aria-label', `${module.nameZh}，${module.nameEn}，未加载`);
    const recovery = element('div', 'module-recovery');
    recovery.hidden = true;
    const recoveryError = element('span', 'module-error');
    recoveryError.dataset.testid = `module-error-${module.moduleId}`;
    const retry = element('button', 'module-retry', '重试');
    retry.type = 'button';
    retry.dataset.action = 'retry-module';
    retry.dataset.moduleId = module.moduleId;
    retry.dataset.testid = `retry-${module.moduleId}`;
    retry.setAttribute('aria-label', `重试加载${module.nameZh}`);
    recovery.append(recoveryError, retry);
    const parts = element('div', 'part-list');
    for (const part of manifest.parts.filter((candidate) => candidate.moduleId === module.moduleId)) {
      const button = element('button', 'part-row');
      button.type = 'button';
      button.dataset.action = 'select-part';
      button.dataset.partId = part.partId;
      button.dataset.testid = `part-${part.partId}`;
      button.setAttribute('aria-label', `选择部件：${part.nameZh}，${part.nameEn}`);
      button.append(
        element('span', 'part-code', part.partId),
        element('strong', 'part-name-zh', part.nameZh),
        element('span', 'part-name-en', part.nameEn),
      );
      parts.append(button);
      partButtons.set(part.partId, button);
    }
    details.append(summary, recovery, parts);
    list.append(details);
    moduleRows.set(module.moduleId, details);
  }
  root.append(heading, tools, list);
  host.replaceChildren(root);

  const handleSearch = (): void => {
    const matches = visibleAssemblyPartIds(manifest.parts, search.value, selectedPartId);
    const hasQuery = search.value.trim().length > 0;
    for (const module of manifest.modules) {
      let moduleHasMatch = false;
      for (const part of manifest.parts.filter((candidate) => candidate.moduleId === module.moduleId)) {
        const button = partButtons.get(part.partId)!;
        const matched = matches.has(part.partId);
        button.hidden = !matched;
        moduleHasMatch ||= matched;
      }
      const row = moduleRows.get(module.moduleId)!;
      row.hidden = !moduleHasMatch;
      if (hasQuery && moduleHasMatch) row.open = true;
    }
  };

  const handleClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
    if (!target) return;
    if (target.dataset.action === 'load-all') {
      void Promise.resolve(callbacks.onLoadAll()).catch(() => undefined);
      return;
    }
    const moduleId = target.dataset.moduleId;
    if (target.dataset.action === 'retry-module' && moduleId) {
      event.preventDefault();
      event.stopPropagation();
      void Promise.resolve(callbacks.onRetryModule(moduleId)).catch(() => undefined);
      return;
    }
    const partId = target.dataset.partId;
    if (target.dataset.action === 'select-part' && partId) {
      void Promise.resolve(callbacks.onSelectPart(partId)).catch(() => undefined);
    }
  };
  search.addEventListener('input', handleSearch);
  const handleQualityChange = (): void => {
    void Promise.resolve(callbacks.onQualityChange(quality.value as QualityMode))
      .catch(() => undefined);
  };
  quality.addEventListener('change', handleQualityChange);
  root.addEventListener('click', handleClick);

  return {
    searchInput: search,
    select(partId) {
      selectedPartId = partId;
      partButtons.forEach((button, id) => {
        button.classList.toggle('is-selected', id === partId);
        if (id === partId) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
      handleSearch();
      if (!partId) return;
      const part = manifest.parts.find((candidate) => candidate.partId === partId);
      if (!part) return;
      const moduleRow = moduleRows.get(part.moduleId);
      if (moduleRow) {
        moduleRow.hidden = false;
        moduleRow.open = true;
      }
      partButtons.get(partId)?.scrollIntoView({ block: 'nearest' });
    },
    setModuleStatus(moduleId, status, error, retryCount = 0, moduleQuality) {
      const row = moduleRows.get(moduleId);
      if (!row) return;
      row.dataset.status = status;
      row.dataset.retryCount = String(retryCount);
      if (moduleQuality) {
        row.dataset.requestedQuality = moduleQuality;
        if (status === 'ready') row.dataset.quality = moduleQuality;
      }
      row.title = error ?? '';
      const label = status === 'ready'
        ? '已加载'
        : status === 'loading'
          ? '加载中'
          : status === 'failed'
            ? '加载失败'
            : '未加载';
      const statusNode = row.querySelector<HTMLElement>('.module-status');
      if (statusNode) statusNode.textContent = retryCount > 0
        ? `${label} · 重试 ${retryCount}`
        : label;
      const recovery = row.querySelector<HTMLElement>('.module-recovery');
      if (recovery) recovery.hidden = status !== 'failed';
      if (status === 'failed') row.open = true;
      const recoveryError = row.querySelector<HTMLElement>('.module-error');
      if (recoveryError) recoveryError.textContent = error ?? '';
      const retry = row.querySelector<HTMLButtonElement>('.module-retry');
      if (retry) retry.disabled = status === 'loading';
      const module = manifest.modules.find((candidate) => candidate.moduleId === moduleId);
      const accessibleLabel = `${module?.nameZh ?? moduleId}，${module?.nameEn ?? ''}，${label}${error ? `：${error}` : ''}`;
      row.setAttribute('aria-label', accessibleLabel);
      row.querySelector('summary')?.setAttribute('aria-label', accessibleLabel);
    },
    setLoadProgress(loaded, total) {
      progress.textContent = `${loaded} / ${total}`;
      progress.setAttribute('aria-label', `模块加载进度：${loaded} / ${total}`);
      loadAll.disabled = loaded >= total;
    },
    setQuality(mode, effective) {
      quality.value = mode;
      qualityEffective.textContent = `当前：${effective === 'high' ? '高' : '低'}`;
      qualityEffective.dataset.quality = effective;
    },
    focusSearch() {
      search.focus();
      search.select();
    },
    dispose() {
      search.removeEventListener('input', handleSearch);
      quality.removeEventListener('change', handleQualityChange);
      root.removeEventListener('click', handleClick);
      root.remove();
    },
  };
}
