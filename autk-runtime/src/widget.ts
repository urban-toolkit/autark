/**
 * anywidget entry point for the Autark runtime.
 *
 * Built as a self-contained ESM bundle (see vite.widget.config.js) that ships
 * inside the Python package (`python/autark/static/autark-widget.js`). Loaded
 * by anywidget in Jupyter/JupyterLab/VS Code/Colab without any local server:
 * DuckDB assets are fetched from the jsDelivr CDN (see autk-db) and the spec
 * schema is bundled inline (see validator.ts).
 *
 * Selections made in plots (histogram brushes) are synced back to the kernel
 * through the `selections` trait: `{ [selectionName]: number[] }`.
 */

import { PlotEvent } from '@urban-toolkit/autk-plot';

import { AutarkRuntime } from './runtime.js';
import type { AutarkSpec } from './types.js';

interface AnyModel {
  get(name: string): unknown;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
  // Present on real anywidget models; absent in the static fake model used by
  // embedded HTML exports (see python/autark/display.py).
  set?(name: string, value: unknown): void;
  save_changes?(): void;
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

/**
 * Subscribes to plot selection events and mirrors them into the model's
 * `selections` trait so the Python kernel can observe brushes.
 *
 * @param runtime Initialized runtime for the current spec.
 * @param spec Spec the runtime was created from (provides selection names).
 * @param model anywidget model; a no-op if it cannot sync (`set` missing).
 * @returns Cleanup functions removing the event subscriptions.
 */
function connectSelectionSync(
  runtime: AutarkRuntime,
  spec: AutarkSpec,
  model: AnyModel,
): Array<() => void> {
  if (typeof model.set !== 'function' || typeof model.save_changes !== 'function') {
    return [];
  }

  const cleanups: Array<() => void> = [];
  const current: Record<string, number[]> = {};

  spec.views.forEach((view, index) => {
    if (view.type !== 'histogram' || !view.selection) {
      return;
    }
    const plot = (view.name ? runtime.getPlot(view.name) : undefined) ?? runtime.getPlot(`_view_${index}`);
    if (!plot) {
      return;
    }

    const selectionName = view.selection.name;
    const handler = () => {
      current[selectionName] = [...(plot.selection ?? [])];
      model.set!('selections', { ...current });
      model.save_changes!();
    };

    plot.events.on(PlotEvent.BRUSH, handler);
    plot.events.on(PlotEvent.BRUSH_X, handler);
    cleanups.push(() => {
      plot.events.off(PlotEvent.BRUSH, handler);
      plot.events.off(PlotEvent.BRUSH_X, handler);
    });
  });

  return cleanups;
}

async function render({ model, el }: RenderContext) {
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.height = (model.get('height') as string) || '640px';
  el.appendChild(container);

  let runtime: AutarkRuntime | undefined;
  let selectionCleanups: Array<() => void> = [];
  let generation = 0;

  const clearSelectionSync = () => {
    for (const cleanup of selectionCleanups) {
      cleanup();
    }
    selectionCleanups = [];
  };

  const execute = async () => {
    const current = ++generation;
    try {
      clearSelectionSync();
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
      selectionCleanups = connectSelectionSync(next, spec, model);
      // Exposed for tests and debugging.
      (el as HTMLElement & { __autarkRuntime?: AutarkRuntime }).__autarkRuntime = next;
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
    clearSelectionSync();
    void runtime?.destroy();
    runtime = undefined;
  };
}

export default { render };
