/**
 * anywidget entry point for the Autark runtime.
 *
 * Built as a self-contained ESM bundle (see vite.widget.config.js) that ships
 * inside the Python package (`python/autark/static/autark-widget.js`). Loaded
 * by anywidget in Jupyter/JupyterLab/VS Code/Colab without any local server:
 * DuckDB assets are fetched from the jsDelivr CDN (see autk-db) and the spec
 * schema is bundled inline (see validator.ts).
 */

import { AutarkRuntime } from './runtime.js';
import type { AutarkSpec } from './types.js';

interface AnyModel {
  get(name: string): unknown;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
}

interface RenderContext {
  model: AnyModel;
  el: HTMLElement;
}

function showError(container: HTMLElement, error: unknown): void {
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.color = '#b00020';
  pre.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
  container.replaceChildren(pre);
}

async function render({ model, el }: RenderContext) {
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.height = (model.get('height') as string) || '640px';
  el.appendChild(container);

  let runtime: AutarkRuntime | undefined;
  let generation = 0;

  const execute = async () => {
    const current = ++generation;
    try {
      if (runtime) {
        await runtime.destroy();
        runtime = undefined;
      }
      container.replaceChildren();
      const spec = model.get('spec') as AutarkSpec;
      const next = await AutarkRuntime.fromSpec(spec, { container });
      if (current !== generation) {
        // A newer spec arrived while this one was loading.
        await next.destroy();
        return;
      }
      runtime = next;
    } catch (error) {
      if (current === generation) {
        showError(container, error);
      }
    }
  };

  const onSpecChange = () => {
    void execute();
  };
  const onHeightChange = () => {
    container.style.height = (model.get('height') as string) || '640px';
  };

  model.on('change:spec', onSpecChange);
  model.on('change:height', onHeightChange);
  await execute();

  return () => {
    model.off('change:spec', onSpecChange);
    model.off('change:height', onHeightChange);
    void runtime?.destroy();
    runtime = undefined;
  };
}

export default { render };
