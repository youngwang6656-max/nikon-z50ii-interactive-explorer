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
  progressValue: number;
  missingDependencies: Array<{ partId: string; nameZh: string }>;
}

export interface InspectorCallbacks {
  onFocus(partId: string): void;
  onHide(partId: string): void;
  onIsolate(partId: string): void;
  onTransparency(partId: string): void;
  onResetSelection(): void;
  onProgressGesture(
    partId: string,
    progress: number,
    phase: 'begin' | 'preview' | 'commit' | 'cancel',
  ): void;
  onSelectDependency(partId: string): void;
  onUndoMove(): void;
  onResetAssembly(): void;
}

export interface InspectorController {
  select(partId: string | null): void;
  updateAssemblyState(state: AssemblyState): void;
  setFreeMode(enabled: boolean): void;
  abortProgressGesture(): void;
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
    progressValue: state.progress[partId] ?? 0,
    missingDependencies: part.dependsOn
      .filter((dependencyId) => (state.progress[dependencyId] ?? 0) < 1)
      .map((dependencyId) => ({
        partId: dependencyId,
        nameZh: parts.get(dependencyId)?.nameZh ?? dependencyId,
      })),
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
  let freeMode = false;
  let activeProgressGesture: {
    readonly partId: string;
    readonly startProgress: number;
    pointerId: number | null;
    progress: number;
  } | null = null;

  const updateProgressElements = (): void => {
    if (!currentPartId) return;
    const value = currentAssemblyState.progress[currentPartId] ?? 0;
    const label = `${Math.round(value * 100)}%`;
    const input = content.querySelector<HTMLInputElement>('[data-progress-input="true"]');
    if (input) {
      input.value = String(Math.round(value * 1000));
      input.setAttribute('aria-valuetext', label);
      input.disabled = !freeMode;
    }
    const live = content.querySelector<HTMLOutputElement>('[data-testid="part-progress-live"]');
    if (live) {
      live.value = label;
      live.textContent = label;
    }
  };

  const updateDependencyWarning = (): void => {
    if (!currentPartId) return;
    const model = createInspectorViewModel(manifest, currentAssemblyState, currentPartId);
    const list = content.querySelector<HTMLUListElement>('[data-testid="dependency-warning"]');
    if (!model || !list) return;
    if (model.missingDependencies.length === 0) {
      list.replaceChildren(node(
        'li',
        'dependency-ready',
        model.dependencies.length > 0 ? '前置条件已满足' : '无前置依赖 / None',
      ));
      list.dataset.locked = 'false';
      return;
    }
    const rows = model.missingDependencies.map((missing) => {
      const item = node('li', 'dependency-missing');
      const link = node('button', 'dependency-link', missing.nameZh);
      link.type = 'button';
      link.dataset.action = 'select-dependency';
      link.dataset.partId = missing.partId;
      link.setAttribute('aria-label', `定位并选择前置部件：${missing.nameZh}`);
      item.append(link);
      return item;
    });
    list.replaceChildren(...rows);
    list.dataset.locked = 'true';
  };

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
    metrics.append(node('dt', '', '拆解步骤'), node('dd', '', String(model.step).padStart(2, '0')));
    const progressTerm = node('dt', '', '当前爆炸进度');
    const progressControl = node('dd', 'part-progress-control');
    progressControl.setAttribute('role', 'group');
    progressControl.setAttribute('aria-label', `${model.nameZh}拆解进度控制`);
    const progressInput = node('input', 'part-progress-range');
    progressInput.type = 'range';
    progressInput.min = '0';
    progressInput.max = '1000';
    progressInput.step = '1';
    progressInput.value = String(Math.round(model.progressValue * 1000));
    progressInput.dataset.progressInput = 'true';
    progressInput.dataset.testid = 'part-progress';
    progressInput.disabled = !freeMode;
    progressInput.setAttribute('aria-label', `${model.nameZh}拆解进度`);
    progressInput.setAttribute('aria-valuetext', model.progressLabel);
    const progressLive = node('output', 'part-progress-live', model.progressLabel);
    progressLive.dataset.testid = 'part-progress-live';
    progressLive.setAttribute('aria-live', 'polite');
    progressControl.append(progressInput, progressLive);
    metrics.append(progressTerm, progressControl);
    const dependencies = node('section', 'dependency-section');
    const dependencyTitle = node('h4', '', '前置依赖 / Dependencies');
    const dependencyList = node('ul', 'dependency-list');
    dependencyList.dataset.testid = 'dependency-warning';
    dependencies.append(dependencyTitle, dependencyList);
    const actions = node('div', 'inspector-actions');
    const actionDefinitions = [
      ['focus', '定位', '定位当前部件'],
      ['hide', '隐藏', '隐藏当前部件'],
      ['isolate', '隔离', '隔离显示当前部件'],
      ['transparency', '透明', '切换当前部件透明度'],
      ['undo-move', '撤销移动', '撤销上一次自由拆解移动'],
      ['reset-assembly', '重置总成', '将全部部件恢复到装配位置'],
      ['reset', '取消选择', '清除当前部件选择'],
    ] as const;
    for (const [action, label, ariaLabel] of actionDefinitions) {
      const button = node('button', 'inspector-action', label);
      button.type = 'button';
      button.dataset.action = action;
      if (action === 'undo-move' || action === 'reset-assembly') button.dataset.testid = action;
      button.setAttribute('aria-label', ariaLabel);
      actions.append(button);
    }
    content.replaceChildren(identity, zh, en, descriptionZh, descriptionEn, metrics, dependencies, actions);
    updateDependencyWarning();
  };
  const handleClick = (event: MouseEvent): void => {
    const action = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-action]')?.dataset.action
      : undefined;
    if (!action) return;
    if (action === 'select-dependency') {
      const partId = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-part-id]')?.dataset.partId
        : undefined;
      if (partId) callbacks.onSelectDependency(partId);
      return;
    }
    if (action === 'undo-move') {
      callbacks.onUndoMove();
      return;
    }
    if (action === 'reset-assembly') {
      callbacks.onResetAssembly();
      return;
    }
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
  const progressInputFrom = (target: EventTarget | null): HTMLInputElement | null =>
    target instanceof HTMLInputElement && target.dataset.progressInput === 'true'
      ? target
      : null;
  const beginProgressGesture = (input: HTMLInputElement, pointerId: number | null): void => {
    if (!freeMode || !currentPartId || input.disabled || activeProgressGesture) return;
    const startProgress = currentAssemblyState.progress[currentPartId] ?? 0;
    activeProgressGesture = {
      partId: currentPartId,
      startProgress,
      pointerId,
      progress: startProgress,
    };
    callbacks.onProgressGesture(currentPartId, startProgress, 'begin');
  };
  const publishProgressPreview = (input: HTMLInputElement): void => {
    if (!freeMode || !currentPartId || input.disabled) return;
    beginProgressGesture(input, null);
    const gesture = activeProgressGesture;
    if (!gesture || gesture.partId !== currentPartId) return;
    const requestedProgress = Number(input.value) / 1000;
    callbacks.onProgressGesture(gesture.partId, requestedProgress, 'preview');
    gesture.progress = currentAssemblyState.progress[gesture.partId] ?? requestedProgress;
    input.value = String(Math.round(gesture.progress * 1000));
    const label = `${Math.round(gesture.progress * 100)}%`;
    input.setAttribute('aria-valuetext', label);
    const live = content.querySelector<HTMLOutputElement>('[data-testid="part-progress-live"]');
    if (live) {
      live.value = label;
      live.textContent = label;
    }
  };
  const commitProgressGesture = (): void => {
    const gesture = activeProgressGesture;
    if (!gesture) return;
    activeProgressGesture = null;
    callbacks.onProgressGesture(gesture.partId, gesture.progress, 'commit');
  };
  const cancelProgressGesture = (): void => {
    const gesture = activeProgressGesture;
    if (!gesture) return;
    activeProgressGesture = null;
    callbacks.onProgressGesture(gesture.partId, gesture.startProgress, 'cancel');
  };
  const handleInput = (event: Event): void => {
    const input = progressInputFrom(event.target);
    if (input) publishProgressPreview(input);
  };
  const handleChange = (event: Event): void => {
    if (progressInputFrom(event.target)) commitProgressGesture();
  };
  const handlePointerDown = (event: PointerEvent): void => {
    const input = progressInputFrom(event.target);
    if (input && event.button === 0 && event.isPrimary !== false) {
      beginProgressGesture(input, event.pointerId);
    }
  };
  const handlePointerUp = (event: PointerEvent): void => {
    if (activeProgressGesture?.pointerId === event.pointerId) commitProgressGesture();
  };
  const handlePointerCancel = (event: PointerEvent): void => {
    if (activeProgressGesture?.pointerId === event.pointerId) cancelProgressGesture();
  };
  const handleKeyDown = (event: KeyboardEvent): void => {
    const input = progressInputFrom(event.target);
    if (!input) return;
    if (event.key === 'Escape' && activeProgressGesture) {
      event.preventDefault();
      event.stopPropagation();
      cancelProgressGesture();
      return;
    }
    if ([
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'PageUp', 'PageDown', 'Home', 'End',
    ].includes(event.key)) beginProgressGesture(input, null);
  };
  const handleKeyUp = (event: KeyboardEvent): void => {
    if (progressInputFrom(event.target) && activeProgressGesture?.pointerId === null) {
      commitProgressGesture();
    }
  };
  const handleFocusOut = (event: FocusEvent): void => {
    if (progressInputFrom(event.target)) commitProgressGesture();
  };
  root.addEventListener('click', handleClick);
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleChange);
  root.addEventListener('pointerdown', handlePointerDown);
  root.addEventListener('pointerup', handlePointerUp);
  root.addEventListener('pointercancel', handlePointerCancel);
  root.addEventListener('keydown', handleKeyDown);
  root.addEventListener('keyup', handleKeyUp);
  root.addEventListener('focusout', handleFocusOut);
  renderEmpty();

  return {
    select: render,
    updateAssemblyState(nextState) {
      currentAssemblyState = nextState;
      if (!currentPartId) return;
      updateProgressElements();
      updateDependencyWarning();
    },
    setFreeMode(enabled) {
      freeMode = enabled;
      if (!enabled) activeProgressGesture = null;
      const input = content.querySelector<HTMLInputElement>('[data-progress-input="true"]');
      if (input) input.disabled = !enabled;
    },
    abortProgressGesture() {
      activeProgressGesture = null;
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
      root.removeEventListener('input', handleInput);
      root.removeEventListener('change', handleChange);
      root.removeEventListener('pointerdown', handlePointerDown);
      root.removeEventListener('pointerup', handlePointerUp);
      root.removeEventListener('pointercancel', handlePointerCancel);
      root.removeEventListener('keydown', handleKeyDown);
      root.removeEventListener('keyup', handleKeyUp);
      root.removeEventListener('focusout', handleFocusOut);
      activeProgressGesture = null;
      root.remove();
    },
  };
}
