import type { AssemblyManifest, PartManifest } from '../domain/manifest';
import type { ShellModuleStatus } from './appShell';

export interface AssemblyTreeCallbacks {
  onSelectPart(partId: string): void | Promise<void>;
  onLoadAll(): void | Promise<void>;
}

export interface AssemblyTreeController {
  readonly searchInput: HTMLInputElement;
  select(partId: string | null): void;
  setModuleStatus(moduleId: string, status: ShellModuleStatus, error?: string): void;
  setLoadProgress(loaded: number, total: number): void;
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
  tools.append(search, loadAll, progress);

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
    details.append(summary, parts);
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
    const partId = target.dataset.partId;
    if (target.dataset.action === 'select-part' && partId) {
      void Promise.resolve(callbacks.onSelectPart(partId)).catch(() => undefined);
    }
  };
  search.addEventListener('input', handleSearch);
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
    setModuleStatus(moduleId, status, error) {
      const row = moduleRows.get(moduleId);
      if (!row) return;
      row.dataset.status = status;
      row.title = error ?? '';
      const label = status === 'ready'
        ? '已加载'
        : status === 'loading'
          ? '加载中'
          : status === 'failed'
            ? '加载失败'
            : '未加载';
      const statusNode = row.querySelector<HTMLElement>('.module-status');
      if (statusNode) statusNode.textContent = label;
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
    focusSearch() {
      search.focus();
      search.select();
    },
    dispose() {
      search.removeEventListener('input', handleSearch);
      root.removeEventListener('click', handleClick);
      root.remove();
    },
  };
}
