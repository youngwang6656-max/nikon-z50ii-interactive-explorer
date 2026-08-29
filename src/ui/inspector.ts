import type { AssemblyState } from '../domain/assemblyState';
import type { AssemblyManifest } from '../domain/manifest';

export interface InspectorViewModel {
  partId: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  step: number;
  reconstructionLabel: string;
  dependencies: string[];
  progressLabel: string;
}

export interface InspectorCallbacks {
  onFocus(partId: string): void;
  onHide(partId: string): void;
  onIsolate(partId: string): void;
  onTransparency(partId: string): void;
  onResetSelection(): void;
}

export interface InspectorController {
  select(partId: string | null): void;
  updateAssemblyState(state: AssemblyState): void;
  setActionState(state: { hidden: boolean; isolated: boolean; transparent: boolean }): void;
  dispose(): void;
}

export function createInspectorViewModel(
  manifest: AssemblyManifest,
  state: AssemblyState,
  partId: string,
): InspectorViewModel | null {
  const part = manifest.parts.find((candidate) => candidate.partId === partId);
  if (!part) return null;
  const parts = new Map(manifest.parts.map((candidate) => [candidate.partId, candidate]));
  return {
    partId,
    nameZh: part.nameZh,
    nameEn: part.nameEn,
    descriptionZh: part.descriptionZh,
    descriptionEn: part.descriptionEn,
    step: part.step,
    reconstructionLabel: part.isReferenceGeometry ? '参考级重建' : '实测几何',
    dependencies: part.dependsOn.map((dependencyId) => {
      const dependency = parts.get(dependencyId);
      return dependency ? `${dependency.nameZh} / ${dependency.nameEn}` : dependencyId;
    }),
    progressLabel: `${Math.round((state.progress[partId] ?? 0) * 100)}%`,
  };
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

export function mountInspector(
  host: HTMLElement,
  manifest: AssemblyManifest,
  state: AssemblyState,
  callbacks: InspectorCallbacks,
): InspectorController {
  const root = node('div', 'inspector-root');
  const heading = node('div', 'panel-heading');
  const title = node('h2', 'panel-title', '部件信息');
  title.id = 'inspector-heading';
  heading.append(node('span', 'panel-index', '02'), title, node('span', 'panel-meta', 'INSPECTOR'));
  const content = node('div', 'inspector-content');
  const footer = node('footer', 'inspector-footer');
  footer.append(
    node('span', 'notice-mark', '!'),
    node('p', 'notice-copy', '参考级内部结构，非 Nikon 原厂 CAD'),
  );
  root.append(heading, content, footer);
  host.replaceChildren(root);
  let currentPartId: string | null = null;
  let currentAssemblyState = state;

  const renderEmpty = (): void => {
    content.className = 'inspector-content inspector-empty';
    content.replaceChildren(
      node('span', 'inspector-glyph', '⌖'),
      node('p', 'inspector-empty-title', '等待选择部件'),
      node('p', 'inspector-empty-copy', 'PART INSPECTION READY'),
    );
  };
  const render = (partId: string | null): void => {
    currentPartId = partId;
    const model = partId ? createInspectorViewModel(manifest, currentAssemblyState, partId) : null;
    if (!model) {
      renderEmpty();
      return;
    }
    content.className = 'inspector-content inspector-detail';
    const identity = node('div', 'inspector-identity');
    const code = node('span', 'inspector-part-id', model.partId);
    const badge = node('span', 'reconstruction-badge', model.reconstructionLabel);
    identity.append(code, badge);
    const zh = node('h3', 'inspector-name-zh', model.nameZh);
    zh.dataset.testid = 'part-name-zh';
    const en = node('p', 'inspector-name-en', model.nameEn);
    const descriptionZh = node('p', 'inspector-description-zh', model.descriptionZh);
    const descriptionEn = node('p', 'inspector-description-en', model.descriptionEn);
    const metrics = node('dl', 'inspector-metrics');
    metrics.append(
      node('dt', '', '拆解步骤'), node('dd', '', String(model.step).padStart(2, '0')),
      node('dt', '', '当前爆炸进度'), node('dd', '', model.progressLabel),
    );
    metrics.lastElementChild?.setAttribute('data-testid', 'part-progress');
    const dependencies = node('section', 'dependency-section');
    const dependencyTitle = node('h4', '', '前置依赖 / Dependencies');
    const dependencyList = node('ul', 'dependency-list');
    dependencyList.dataset.testid = 'dependency-warning';
    const values = model.dependencies.length > 0 ? model.dependencies : ['无前置依赖 / None'];
    values.forEach((value) => dependencyList.append(node('li', '', value)));
    dependencies.append(dependencyTitle, dependencyList);
    const actions = node('div', 'inspector-actions');
    const actionDefinitions = [
      ['focus', '定位', '定位当前部件'],
      ['hide', '隐藏', '隐藏当前部件'],
      ['isolate', '隔离', '隔离显示当前部件'],
      ['transparency', '透明', '切换当前部件透明度'],
      ['reset', '取消选择', '清除当前部件选择'],
    ] as const;
    for (const [action, label, ariaLabel] of actionDefinitions) {
      const button = node('button', 'inspector-action', label);
      button.type = 'button';
      button.dataset.action = action;
      button.setAttribute('aria-label', ariaLabel);
      actions.append(button);
    }
    content.replaceChildren(identity, zh, en, descriptionZh, descriptionEn, metrics, dependencies, actions);
  };
  const handleClick = (event: MouseEvent): void => {
    const action = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-action]')?.dataset.action
      : undefined;
    if (!action) return;
    if (action === 'reset') {
      callbacks.onResetSelection();
      return;
    }
    if (!currentPartId) return;
    if (action === 'focus') callbacks.onFocus(currentPartId);
    else if (action === 'hide') callbacks.onHide(currentPartId);
    else if (action === 'isolate') callbacks.onIsolate(currentPartId);
    else if (action === 'transparency') callbacks.onTransparency(currentPartId);
  };
  root.addEventListener('click', handleClick);
  renderEmpty();

  return {
    select: render,
    updateAssemblyState(nextState) {
      currentAssemblyState = nextState;
      if (!currentPartId) return;
      const progress = Math.round((currentAssemblyState.progress[currentPartId] ?? 0) * 100);
      const progressLabel = content.querySelector<HTMLElement>('[data-testid="part-progress"]');
      if (progressLabel) progressLabel.textContent = `${progress}%`;
    },
    setActionState(actionState) {
      const mappings = [
        ['hide', actionState.hidden],
        ['isolate', actionState.isolated],
        ['transparency', actionState.transparent],
      ] as const;
      for (const [action, active] of mappings) {
        const button = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
        button?.classList.toggle('is-active', active);
        button?.setAttribute('aria-pressed', String(active));
      }
    },
    dispose() {
      root.removeEventListener('click', handleClick);
      root.remove();
    },
  };
}
