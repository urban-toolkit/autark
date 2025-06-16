import { GeoJsonProperties } from "geojson";
import { PlotEvent } from './constants';
import { PlotEventListener } from "./types";


export class PlotEvents {
    private _listeners: { [event: string]: PlotEventListener[] } = {};

    constructor(events: PlotEvent[]) {
        events.forEach(event => {
            this._listeners[event] = [];
        });
    }

    get listeners(): { [event: string]: PlotEventListener[] } {
        return this._listeners;
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

    emit(event: string, selection: number[] | string[] | GeoJsonProperties[]): void {
        if (this._listeners[event]) {
            this._listeners[event].forEach(listener => listener(selection));
        }
    }
}
