"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type * as MapLibre from "maplibre-gl";
import type { Entrepot } from "@/lib/types";

const nf = new Intl.NumberFormat("fr-FR");

// MapLibre est servi depuis /public et chargé comme un script classique :
// son worker est intégré au fichier, le bundler n'intervient pas.
function chargerMapLibre(): Promise<typeof MapLibre> {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);

  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>("script[data-maplibre]");
    if (!script) {
      script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.9.0/dist/maplibre-gl.js";
      script.async = true;
      script.dataset.maplibre = "1";
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => {
      if (window.maplibregl) resolve(window.maplibregl);
      else reject(new Error("MapLibre s'est chargé mais n'est pas disponible"));
    });
    script.addEventListener("error", () => reject(new Error("Impossible de charger /maplibre-gl.js")));
  });
}

export function CarteEntrepots({ entrepots }: { entrepots: Entrepot[] }) {
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let carte: MapLibre.Map | undefined;
    let annule = false;

    (async () => {
      const maplibregl = await chargerMapLibre();
      if (annule || !conteneur.current) return;

      carte = new maplibregl.Map({
        container: conteneur.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [2.6, 48.72],
        zoom: 8.3,
        attributionControl: { compact: true },
      });
      carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      carte.on("load", () => {
        if (!carte) return;

        carte.addSource("entrepots", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: entrepots
              .filter((e) => e.lon !== null && e.lat !== null)
              .map((e) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [e.lon as number, e.lat as number] },
                properties: {
                  exploitant: e.exploitant ?? "Exploitant non identifié",
                  commune: e.commune ?? "",
                  volume: e.volume_1510 ?? 0,
                  regime: e.regime_1510 ?? "",
                },
              })),
          },
        });

        carte.addLayer({
          id: "entrepots",
          type: "circle",
          source: "entrepots",
          paint: {
            "circle-color": "#e8751a",
            "circle-opacity": 0.85,
            "circle-stroke-color": "#17202a",
            "circle-stroke-width": 1,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["sqrt", ["get", "volume"]],
              0, 3,
              300, 6,
              1000, 14,
              1500, 20,
            ],
          },
        });

        carte.on("mouseenter", "entrepots", () => {
          if (carte) carte.getCanvas().style.cursor = "pointer";
        });
        carte.on("mouseleave", "entrepots", () => {
          if (carte) carte.getCanvas().style.cursor = "";
        });

        carte.on("click", "entrepots", (ev) => {
          const f = ev.features?.[0];
          if (!f || !carte) return;
          const p = f.properties as { exploitant: string; commune: string; volume: number; regime: string };

          // Construction en texte brut : aucune donnée n'est injectée comme HTML
          const bloc = document.createElement("div");
          const titre = document.createElement("strong");
          titre.textContent = p.exploitant;
          const lieu = document.createElement("div");
          lieu.textContent = p.commune;
          const volume = document.createElement("div");
          volume.textContent = p.volume ? `Volume autorisé : ${nf.format(p.volume)} m³` : "Volume non renseigné";
          const regime = document.createElement("div");
          regime.textContent = p.regime ? `Régime : ${p.regime}` : "";
          bloc.append(titre, lieu, volume, regime);

          const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
          new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
            .setLngLat(coords)
            .setDOMContent(bloc)
            .addTo(carte);
        });
      });
    })().catch((err) => {
      console.error(err);
    });

    return () => {
      annule = true;
      carte?.remove();
    };
  }, [entrepots]);

  return (
    <div
      ref={conteneur}
      className="h-full w-full"
      role="region"
      aria-label="Carte des grands entrepôts classés en Île-de-France"
    />
  );
}
