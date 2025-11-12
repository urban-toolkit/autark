import { AutkSpec } from "./types";

export interface IEngine {
    run(): Promise<void>;
    updatedSpec(spec: AutkSpec): Promise<void>;
    destroy(): void;
}