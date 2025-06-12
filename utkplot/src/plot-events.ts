import { PlotEvent, PlotEventListener } from './constants';

export class PlotEvents {
    private _listeners: { [event: string]: PlotEventListener[] } = {};

    constructor(events: PlotEvent[]) {
        events.forEach(event => {
            this._listeners[event] = [];
        });
    }

    addEventListener(event: string, listener: PlotEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event].push(listener);
        }
    }

    removeEventListener(event: string, listener: PlotEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(l => l !== listener);
        }
    }

    emit(event: string, selection: number[] | string[]): void {
        if (this._listeners[event]) {
            console.log(`Emitting event: ${event} with selection: ${selection}`);
            this._listeners[event].forEach(listener => listener(selection));
        }
    }
}
