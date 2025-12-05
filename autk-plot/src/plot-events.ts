import { PlotEvent } from './constants';
import { PlotEventListener } from "./types";

export class PlotEvents {
    private _listeners: Record<PlotEvent, PlotEventListener[]> = {} as Record<PlotEvent, PlotEventListener[]>;

    constructor(events: PlotEvent[]) {
        events.forEach(event => {
            this._listeners[event] = [];
        });
    }

    get listeners(): Record<PlotEvent, PlotEventListener[]> {
        return this._listeners;
    }

    addEventListener(event: PlotEvent, listener: PlotEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event].push(listener);
        }
    }

    removeEventListener(event: PlotEvent, listener: PlotEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(l => l !== listener);
        }
    }

    emit(event: PlotEvent, selection: number[]): void {
        if (this._listeners[event]) {
            this._listeners[event].forEach(listener => listener(selection));
        }
    }
}
