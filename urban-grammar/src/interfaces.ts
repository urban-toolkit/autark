import { UrbanSpec } from "./types";

export interface IEngine {
    run(): Promise<void>;
    updatedSpec(spec: UrbanSpec): Promise<void>;
    destroy(): void;
}

// TODO: unified context that guide the adaptors on what functions and data are needed to implement the grammar.
// export interface DataContext {
//      getTables(): Array<Table>,
// }

// export interface MapContext {
//      getTables(): Array<Table>,
// }