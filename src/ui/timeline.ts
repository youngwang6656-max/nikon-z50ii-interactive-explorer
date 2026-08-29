import type { GuidedSequenceSnapshot } from '../domain/guidedSequence';
import type { AssemblyManifest } from '../domain/manifest';

export type TimelineMode = 'guided' | 'free';

export interface TimelineViewModel {
  title: string;
  subtitle: string;
  count: string;
  progressPercent: number;
  playLabel: string;
  playText: string;
}
export interface TimelineCallbacks {
  onModeChange(mode: TimelineMode): void;
  onTogglePlay(): void;
  onPrevious(): void;
  onNext(): void;
  onSeek(normalizedTime: number): void;
  onGlobalExplode(progress: number): void;
}

export interface TimelineController {
  readonly root: HTMLElement;
  readonly mode: TimelineMode;
  render(snapshot: GuidedSequenceSnapshot, globalExplodeProgress?: number): void;
  setMode(mode: TimelineMode): void;
  dispose(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function formatCount(value: number, total: number): string {
  const width = Math.max(2, String(total).length);
  return `${String(value).padStart(width, '0')} / ${String(total).padStart(width, '0')}`;
}

export function createTimelineViewModel(
  snapshot: GuidedSequenceSnapshot,
  totalSteps: number,
): TimelineViewModel {
  const currentStep = snapshot.currentStep;
  return {
    title: currentStep?.titleZh ?? '装配完成',
    subtitle: currentStep?.titleEn ?? 'Assembly ready',
    count: formatCount(snapshot.completedStepCount, totalSteps),
    progressPercent: snapshot.normalizedTime * 100,
    playLabel: snapshot.isPlaying ? '暂停拆解序列' : '播放拆解序列',
    playText: snapshot.isPlaying ? '暂停' : '播放',
  };
}

export function mountTimeline(
  host: HTMLElement,
  manifest: AssemblyManifest,
  callbacks: TimelineCallbacks,
): TimelineController {
  const root = element('div', 'guided-timeline');
  const heading = element('div', 'timeline-heading');
  const index = element('span', 'panel-index', '03');
  const headingCopy = element('div', 'timeline-heading-copy');
  const title = element('h2', 'timeline-title', '拆解序列');
  title.id = 'timeline-heading';
  const stepSubtitle = element('span', 'timeline-step-en', 'Guided disassembly');
  headingCopy.append(title, stepSubtitle);
  const count = element('span', 'timeline-count', formatCount(0, manifest.steps.length));
  heading.append(index, headingCopy, count);

  const controls = element('div', 'timeline-controls');
  const modeLabel = element('label', 'timeline-mode-label', '模式');
  const modeSelect = element('select', 'timeline-mode');
  modeSelect.dataset.testid = 'mode-guided';
  modeSelect.setAttribute('aria-label', '时间轴交互模式');
  const guidedOption = element('option', '', '引导拆解');
  guidedOption.value = 'guided';
  const freeOption = element('option', '', '自由查看');
  freeOption.value = 'free';
  modeSelect.append(guidedOption, freeOption);
  modeLabel.append(modeSelect);

  const previous = element('button', 'timeline-button timeline-previous', '上一步');
  previous.type = 'button';
  previous.dataset.testid = 'guided-previous';
  previous.setAttribute('aria-label', '返回上一个拆解步骤');
  const play = element('button', 'timeline-button timeline-play', '播放');
  play.type = 'button';
  play.dataset.testid = 'guided-play';
  play.setAttribute('aria-label', '播放拆解序列');
  const next = element('button', 'timeline-button timeline-next', '下一步');
  next.type = 'button';
  next.dataset.testid = 'guided-next';
  next.setAttribute('aria-label', '前往下一个拆解步骤');

  const stepCopy = element('div', 'timeline-step-copy');
  const stepTitle = element('strong', 'timeline-step-title', manifest.steps[0]?.titleZh ?? '装配完成');
  stepTitle.dataset.testid = 'guided-step-title';
  const stepEnglish = element('span', 'timeline-step-en', manifest.steps[0]?.titleEn ?? 'Assembly ready');
  stepCopy.append(stepTitle, stepEnglish);

  const progressLabel = element('label', 'timeline-slider-label');
  progressLabel.append(element('span', 'timeline-slider-name', '序列进度'));
  const progress = element('input', 'timeline-slider');
  progress.type = 'range';
  progress.min = '0';
  progress.max = '1000';
  progress.step = '1';
  progress.value = '0';
  progress.dataset.testid = 'guided-progress';
  progress.setAttribute('aria-label', '引导拆解进度');
  progressLabel.append(progress);

  const explodeLabel = element('label', 'timeline-slider-label timeline-global-label');
  explodeLabel.append(element('span', 'timeline-slider-name', '整体爆炸'));
  const explode = element('input', 'timeline-slider timeline-global-slider');
  explode.type = 'range';
  explode.min = '0';
  explode.max = '1000';
  explode.step = '1';
  explode.value = '0';
  explode.dataset.testid = 'global-explode';
  explode.setAttribute('aria-label', '整体爆炸进度');
  explodeLabel.append(explode);

  controls.append(modeLabel, previous, play, next, stepCopy, progressLabel, explodeLabel);
  root.append(heading, controls);
  host.replaceChildren(root);

  let currentMode: TimelineMode = 'guided';
  let lastSnapshot: GuidedSequenceSnapshot | null = null;
  root.dataset.mode = currentMode;
  const applyControlState = (): void => {
    const free = currentMode === 'free';
    play.disabled = free;
    progress.disabled = free;
    previous.disabled = free || (lastSnapshot?.normalizedTime ?? 0) <= 0;
    next.disabled = free || (lastSnapshot?.normalizedTime ?? 0) >= 1;
  };
  const handleModeChange = (): void => {
    currentMode = modeSelect.value as TimelineMode;
    root.dataset.mode = currentMode;
    applyControlState();
    callbacks.onModeChange(currentMode);
  };
  const handlePlay = (): void => callbacks.onTogglePlay();
  const handlePrevious = (): void => callbacks.onPrevious();
  const handleNext = (): void => callbacks.onNext();
  const handleSeek = (): void => callbacks.onSeek(Number(progress.value) / 1000);
  const handleGlobalExplode = (): void => callbacks.onGlobalExplode(Number(explode.value) / 1000);
  modeSelect.addEventListener('change', handleModeChange);
  play.addEventListener('click', handlePlay);
  previous.addEventListener('click', handlePrevious);
  next.addEventListener('click', handleNext);
  progress.addEventListener('input', handleSeek);
  explode.addEventListener('input', handleGlobalExplode);
  applyControlState();

  let disposed = false;
  return {
    root,
    get mode() { return currentMode; },
    render(snapshot, globalExplodeProgress) {
      if (disposed) return;
      lastSnapshot = snapshot;
      const model = createTimelineViewModel(snapshot, manifest.steps.length);
      stepTitle.textContent = model.title;
      stepEnglish.textContent = model.subtitle;
      count.textContent = model.count;
      play.textContent = model.playText;
      play.setAttribute('aria-label', model.playLabel);
      play.setAttribute('aria-pressed', String(snapshot.isPlaying));
      progress.value = String(Math.round(snapshot.normalizedTime * 1000));
      progress.setAttribute('aria-valuetext', `${model.count}，${model.title}`);
      explode.value = String(Math.round((globalExplodeProgress ?? snapshot.normalizedTime) * 1000));
      applyControlState();
    },
    setMode(mode) {
      if (disposed) return;
      currentMode = mode;
      modeSelect.value = mode;
      root.dataset.mode = mode;
      applyControlState();
    },
    dispose() {
      if (disposed) return;
      modeSelect.removeEventListener('change', handleModeChange);
      play.removeEventListener('click', handlePlay);
      previous.removeEventListener('click', handlePrevious);
      next.removeEventListener('click', handleNext);
      progress.removeEventListener('input', handleSeek);
      explode.removeEventListener('input', handleGlobalExplode);
      root.remove();
      disposed = true;
    },
  };
}
