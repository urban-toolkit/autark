import { MapEventListener } from './constants';

export class MapEvents {
    private _listeners: { [event: string]: MapEventListener[] } = {};

    constructor(events: string[]) {
        events.forEach(event => {
            this._listeners[event] = [];
        });
    }

    addEventListener(event: string, listener: MapEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event].push(listener);
        }
    }

    removeEventListener(event: string, listener: MapEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(l => l !== listener);
        }
    }

    emit(event: string, selection: string[], layerId: string): void {
        if (this._listeners[event]) {
            this._listeners[event].forEach(listener => listener(selection, layerId));
        }
    }
}
