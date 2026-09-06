import { GALLERY_MAP_VIEWS } from './gallery-map-views';
import { GALLERY_PLOT_VIEWS } from './gallery-plot-views';
import { USECASE_VIEWS } from './usecase-views';
import type { ViewDefinition, ViewCategory, ViewApp } from './types';

export const ALL_VIEWS: ViewDefinition[] = [
  ...GALLERY_MAP_VIEWS,
  ...GALLERY_PLOT_VIEWS,
  ...USECASE_VIEWS,
];

export function getViewById(id: string): ViewDefinition | undefined {
  return ALL_VIEWS.find(v => v.id === id);
}

export function getViewsByApp(app: ViewApp): ViewDefinition[] {
  return ALL_VIEWS.filter(v => v.app === app);
}

export function getViewsByCategory(category: ViewCategory): ViewDefinition[] {
  return ALL_VIEWS.filter(v => v.category === category);
}

export function getMapViews(): ViewDefinition[] {
  return GALLERY_MAP_VIEWS;
}

export function getPlotViews(): ViewDefinition[] {
  return GALLERY_PLOT_VIEWS;
}

export function getUsecaseViews(): ViewDefinition[] {
  return USECASE_VIEWS;
}
