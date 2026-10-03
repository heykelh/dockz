import type * as MapLibre from "maplibre-gl";

declare global {
  interface Window {
    maplibregl?: typeof MapLibre;
  }
}

export {};
