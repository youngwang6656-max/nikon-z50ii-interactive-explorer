import type { AssemblyManifest } from '../domain/manifest';

export type ShellModuleStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface AppShell {
  readonly root: HTMLElement;
  readonly viewerHost: HTMLElement;
  readonly assemblyPanel?: HTMLElement;
  readonly inspectorPanel?: HTMLElement;
  readonly timelinePanel?: HTMLElement;
  setModuleStatus(moduleId: string, status: ShellModuleStatus, error?: string): void;
  dispose(): void;
}

const REQUIRED_DISCLAIMER = '参考级内部结构，非 Nikon 原厂 CAD';

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function mountAppShell(
  container: HTMLElement,
  manifest: AssemblyManifest,
): AppShell {
  const root = createElement('div', 'app-shell');
  const header = createElement('header', 'app-header');
  const brand = createElement('div', 'brand-lockup');
  brand.append(
    createElement('span', 'brand-kicker', 'INTERACTIVE STRUCTURE LAB'),
    createElement('h1', 'brand-title', 'Nikon Z50II'),
    createElement('p', 'brand-subtitle', '交互式结构解析 · Interactive Assembly'),
  );
  const systemState = createElement('div', 'system-state');
  systemState.append(
    createElement('span', 'status-led'),
    createElement('span', 'status-copy', 'RENDER FOUNDATION ONLINE'),
  );
  header.append(brand, systemState);

  const assemblyTree = createElement('nav', 'panel assembly-panel');
  assemblyTree.setAttribute('aria-labelledby', 'assembly-heading');
  const assemblyHeading = createElement('div', 'panel-heading');
  const assemblyTitle = createElement('h2', 'panel-title', '组件总成');
  assemblyTitle.id = 'assembly-heading';
  assemblyHeading.append(
    createElement('span', 'panel-index', '01'),
    assemblyTitle,
    createElement('span', 'panel-meta', `${manifest.modules.length} MODULES`),
  );
  const moduleList = createElement('ol', 'module-list');
  for (const module of manifest.modules) {
    const item = createElement('li', 'module-row');
    item.dataset.moduleId = module.moduleId;
    item.dataset.status = 'idle';
    const indicator = createElement('span', 'module-indicator');
    indicator.setAttribute('aria-hidden', 'true');
    const copy = createElement('span', 'module-copy');
    copy.append(
      createElement('strong', 'module-name-zh', module.nameZh),
      createElement('span', 'module-name-en', module.nameEn),
    );
    const code = createElement(
      'span',
      'module-code',
      module.moduleId.slice(0, 2),
    );
    item.append(indicator, copy, code);
    moduleList.append(item);
  }
  assemblyTree.append(assemblyHeading, moduleList);

  const viewerRegion = createElement('main', 'viewer-region');
  viewerRegion.setAttribute('aria-labelledby', 'viewer-heading');
  const viewerHeading = createElement('h2', 'visually-hidden', '三维结构视图');
  viewerHeading.id = 'viewer-heading';
  const viewerHost = createElement('div', 'viewer-host');
  const viewportHud = createElement('div', 'viewport-hud');
  viewportHud.setAttribute('aria-hidden', 'true');
  viewportHud.append(
    createElement('span', 'hud-label', 'ASSEMBLED / HIGH'),
    createElement('span', 'hud-coordinate', 'X 000.0  Y 000.0  Z 000.0'),
  );
  const reticle = createElement('div', 'viewport-reticle');
  reticle.setAttribute('aria-hidden', 'true');
  viewerRegion.append(viewerHeading, viewerHost, viewportHud, reticle);

  const inspector = createElement('aside', 'panel inspector-panel');
  inspector.setAttribute('aria-labelledby', 'inspector-heading');
  const inspectorHeading = createElement('div', 'panel-heading');
  const inspectorTitle = createElement('h2', 'panel-title', '部件信息');
  inspectorTitle.id = 'inspector-heading';
  inspectorHeading.append(
    createElement('span', 'panel-index', '02'),
    inspectorTitle,
    createElement('span', 'panel-meta', 'INSPECTOR'),
  );
  const emptyInspector = createElement('div', 'inspector-empty');
  emptyInspector.append(
    createElement('span', 'inspector-glyph', '⌖'),
    createElement('p', 'inspector-empty-title', '等待选择部件'),
    createElement('p', 'inspector-empty-copy', 'PART INSPECTION READY'),
  );
  const inspectorFooter = createElement('footer', 'inspector-footer');
  inspectorFooter.append(
    createElement('span', 'notice-mark', '!'),
    createElement('p', 'notice-copy', REQUIRED_DISCLAIMER),
  );
  inspector.append(inspectorHeading, emptyInspector, inspectorFooter);

  const timeline = createElement('footer', 'timeline-panel');
  timeline.setAttribute('aria-labelledby', 'timeline-heading');
  timeline.setAttribute('aria-label', '拆解序列与爆炸进度控制');
  const timelineHeading = createElement('div', 'timeline-heading');
  const timelineTitle = createElement('h2', 'timeline-title', '拆解序列');
  timelineTitle.id = 'timeline-heading';
  timelineHeading.append(
    createElement('span', 'panel-index', '03'),
    timelineTitle,
    createElement('span', 'timeline-count', `00 / ${String(manifest.steps.length).padStart(2, '0')}`),
  );
  const timelineTrack = createElement('div', 'timeline-track');
  timelineTrack.setAttribute('aria-hidden', 'true');
  timelineTrack.append(createElement('span', 'timeline-progress'));
  timeline.append(timelineHeading, timelineTrack);

  root.append(header, assemblyTree, viewerRegion, inspector, timeline);
  container.replaceChildren(root);

  return {
    root,
    viewerHost,
    assemblyPanel: assemblyTree,
    inspectorPanel: inspector,
    timelinePanel: timeline,
    setModuleStatus(moduleId, status, error) {
      const row = moduleList.querySelector<HTMLElement>(
        `[data-module-id="${CSS.escape(moduleId)}"]`,
      );
      if (!row) return;
      row.dataset.status = status;
      row.title = error ?? '';
      const accessibleStatus =
        status === 'ready'
          ? '已加载'
          : status === 'loading'
            ? '加载中'
            : status === 'failed'
              ? `加载失败${error ? `：${error}` : ''}`
              : '未加载';
      row.setAttribute('aria-label', `${row.textContent ?? moduleId}，${accessibleStatus}`);
    },
    dispose() {
      root.remove();
    },
  };
}
