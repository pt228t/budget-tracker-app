import { renderAppShell } from './app-shell.js';

const appRoot = document.querySelector('#app');

if (!appRoot) {
  throw new Error('Missing #app mount node');
}

appRoot.innerHTML = renderAppShell();
