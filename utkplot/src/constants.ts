export enum PlotEvent {
    CLICK = 'click',
    BRUSH = 'brush',
}

export type PlotEventListener = (selection: number[] | string[]) => void;