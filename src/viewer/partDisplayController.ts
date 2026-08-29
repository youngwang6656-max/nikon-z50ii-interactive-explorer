import { Object3D } from 'three';

import { VisibilityController } from './visibilityController';

export interface PartDisplayState {
  hidden: boolean;
  isolated: boolean;
  transparent: boolean;
}

export class PartDisplayController {
  private readonly partIndex: ReadonlyMap<string, Object3D>;
  readonly visibility: VisibilityController;
  private disposed = false;

  constructor(partIndex: ReadonlyMap<string, Object3D>) {
    this.partIndex = partIndex;
    this.visibility = new VisibilityController(() => this.partIndex.values());
  }

  getState(partId: string): PartDisplayState {
    const target = this.partIndex.get(partId);
    const state = target
      ? this.visibility.getState(target)
      : { hidden: false, isolated: false, ghosted: false };
    return {
      hidden: state.hidden && !state.isolated,
      isolated: state.isolated,
      transparent: state.ghosted,
    };
  }

  toggleHidden(partId: string): void {
    const target = this.partIndex.get(partId);
    if (this.disposed || !target) return;
    const state = this.visibility.getState(target);
    if (state.isolated) this.visibility.clearIsolation();
    if (state.hidden) this.visibility.show(target);
    else this.visibility.hide(target);
  }

  toggleIsolation(partId: string): void {
    const target = this.partIndex.get(partId);
    if (this.disposed || !target) return;
    if (this.visibility.getState(target).isolated) this.visibility.clearIsolation();
    else this.visibility.isolate(target);
  }

  toggleTransparency(partId: string): void {
    const target = this.partIndex.get(partId);
    if (this.disposed || !target) return;
    if (this.visibility.getState(target).ghosted) this.visibility.unghost(target);
    else this.visibility.ghost(target);
  }

  reconcileSelection(partId: string | null): void {
    if (this.disposed) return;
    const selected = partId ? this.partIndex.get(partId) : undefined;
    const isolated = [...this.partIndex.values()].find(
      (target) => this.visibility.getState(target).isolated,
    );
    if (isolated && isolated !== selected) this.visibility.clearIsolation();
    if (selected) this.visibility.show(selected);
    this.visibility.refresh();
  }

  apply(): void {
    if (!this.disposed) this.visibility.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visibility.dispose();
  }
}
