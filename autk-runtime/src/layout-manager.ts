/**
 * LayoutManager - Creates and manages DOM layout structure for views
 */

import type { Layout, View } from './types.js';

export class LayoutManager {
  private rootContainer: HTMLElement | null = null;
  private viewContainers = new Map<number, HTMLElement>();

  /**
   * Create layout structure for views.
   *
   * @param container - Root container element
   * @param views - Array of views to layout
   * @param layout - Layout configuration
   * @returns Map of view index to container element
   */
  createLayout(
    container: HTMLElement | string,
    views: View[],
    layout?: Layout
  ): Map<number, HTMLElement> {
    // Resolve container
    if (typeof container === 'string') {
      const el = document.querySelector(container);
      if (!el) {
        throw new Error(`Container not found: ${container}`);
      }
      this.rootContainer = el as HTMLElement;
    } else {
      this.rootContainer = container;
    }

    // Clear existing content
    this.rootContainer.innerHTML = '';

    // Apply layout type
    const layoutType = layout?.type || 'vertical';
    this.applyLayoutStyles(this.rootContainer, layoutType, layout);

    // Create containers for each view
    for (let i = 0; i < views.length; i++) {
      const viewContainer = this.createViewContainer(i, views[i], layoutType);
      this.rootContainer.appendChild(viewContainer);
      this.viewContainers.set(i, viewContainer);
    }

    return this.viewContainers;
  }

  /**
   * Apply layout styles to root container.
   */
  private applyLayoutStyles(
    container: HTMLElement,
    layoutType: 'vertical' | 'horizontal' | 'grid',
    layout?: Layout
  ): void {
    container.style.display = 'flex';
    container.style.width = '100%';
    container.style.height = '100%';

    switch (layoutType) {
      case 'vertical':
        container.style.flexDirection = 'column';
        break;
      case 'horizontal':
        container.style.flexDirection = 'row';
        break;
      case 'grid':
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${layout?.columns || 2}, 1fr)`;
        break;
    }

    // Apply gap if specified
    if (layout?.gap !== undefined) {
      container.style.gap = `${layout.gap}px`;
    } else {
      container.style.gap = '10px'; // Default gap
    }
  }

  /**
   * Create a container for a single view.
   */
  private createViewContainer(
    index: number,
    view: View,
    layoutType: string
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = `autark-view-container autark-view-${view.type}`;
    container.dataset.viewIndex = index.toString();
    if (view.name) {
      container.dataset.viewName = view.name;
    }

    // Set flex behavior based on view type
    if (layoutType === 'vertical') {
      container.style.flex = view.type === 'map' ? '1 1 auto' : '0 0 auto';
      container.style.minHeight = view.type === 'map' ? '400px' : '300px';
    } else if (layoutType === 'horizontal') {
      container.style.flex = '1 1 0';
      container.style.minWidth = '0';
    }

    container.style.width = '100%';
    container.style.position = 'relative';

    return container;
  }

  /**
   * Get container for a specific view index.
   */
  getViewContainer(index: number): HTMLElement | undefined {
    return this.viewContainers.get(index);
  }

  /**
   * Clean up all containers.
   */
  destroy(): void {
    if (this.rootContainer) {
      this.rootContainer.innerHTML = '';
    }
    this.viewContainers.clear();
    this.rootContainer = null;
  }
}
