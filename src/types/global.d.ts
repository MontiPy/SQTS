import type { SQTSApi } from '../../electron/preload';

declare global {
  interface Window {
    sqts: SQTSApi;
  }
}

export {};
