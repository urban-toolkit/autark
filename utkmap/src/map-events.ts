import { MapEvent, MapEventListener } from './constants';

export class MapEvents {
    private _listeners: { [event: string]: MapEventListener[] } = {};

    constructor(events: MapEvent[]) {
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

    emit(event: string, selection: number[] | string[], layerId: string): void {
        if (this._listeners[event]) {
            console.log(`Emitting event: ${event} with selection: ${selection} for layer: ${layerId}`);
            this._listeners[event].forEach(listener => listener(selection, layerId));
        }
    }
}
