import { UrbanSpec } from "./types";

export interface IEngine {
    run(): Promise<void>;
    updatedSpec(spec: UrbanSpec): Promise<void>;
    destroy(): void;
}