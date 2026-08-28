import './styles/app.css';

import { createApp, type App } from './app/createApp';

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Missing #app mount element');

let app: App | null = null;

void createApp(mount)
  .then((createdApp) => {
    app = createdApp;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const failure = document.createElement('main');
    failure.className = 'boot-failure';
    const title = document.createElement('h1');
    title.textContent = '视图初始化失败';
    const detail = document.createElement('p');
    detail.textContent = message;
    failure.append(title, detail);
    mount.replaceChildren(failure);
  });

window.addEventListener('pagehide', () => app?.dispose(), { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => app?.dispose());
}
