export type SyntheticScale = 'minimal' | 'light' | 'standard' | 'heavy';

export interface RouteInterceptorOptions {
  syntheticScale?: SyntheticScale;
  interceptOverpass?: boolean;
  interceptStaticData?: boolean;
  simulatedLatencyMs?: number;
}

export interface InterceptedPayloadSummary {
  url: string;
  type: string;
  byteLength: number;
  durationMs: number;
  timestamp: number;
}
