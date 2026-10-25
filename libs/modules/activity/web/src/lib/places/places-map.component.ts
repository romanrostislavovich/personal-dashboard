import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { FrequentPlace, PlacesEntry, TripMode } from '@pd/contracts';

/** A mark or a line of the map, whichever map draws it. */
export interface MapStay {
  latitude: number;
  longitude: number;
  label: string;
  /** Of the day (strong) or of the period (faint). */
  ofDay: boolean;
}

export interface MapTrip {
  path: [number, number][];
  mode: TripMode;
}

/** A map that draws the day: Leaflet with OpenStreetMap, or Google Maps with the user's key. */
interface Renderer {
  draw(stays: MapStay[], trips: MapTrip[]): void;
  destroy(): void;
}

const COLORS: Record<TripMode, string> = { walk: '#2e7d32', bike: '#ef6c00', ride: '#1565c0' };

async function leaflet(element: HTMLElement): Promise<Renderer> {
  const module = await import('leaflet');
  // Leaflet is CommonJS: a dynamic import hands it over as `default`.
  const L = (module as unknown as { default?: typeof module }).default ?? module;
  const map = L.map(element, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  return {
    draw(stays, trips) {
      layer.clearLayers();
      const bounds: [number, number][] = [];
      for (const trip of trips) {
        L.polyline(trip.path, { color: COLORS[trip.mode], weight: 4, opacity: 0.85 }).addTo(layer);
        bounds.push(...trip.path);
      }
      for (const stay of stays) {
        L.circleMarker([stay.latitude, stay.longitude], {
          radius: stay.ofDay ? 8 : 5,
          color: stay.ofDay ? '#6a1b9a' : '#9e9e9e',
          fillOpacity: stay.ofDay ? 0.8 : 0.4,
        })
          .bindTooltip(stay.label)
          .addTo(layer);
        bounds.push([stay.latitude, stay.longitude]);
      }
      if (bounds.length) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
      } else {
        map.setView([52.23, 21.01], 11);
      }
    },
    destroy: () => map.remove(),
  };
}

/** The little of Google Maps' API used here (no types package for one component). */
interface GoogleMaps {
  Map: new (element: HTMLElement, options: object) => { fitBounds(bounds: object): void };
  LatLngBounds: new () => { extend(point: object): void; isEmpty(): boolean };
  Polyline: new (options: object) => { setMap(map: unknown): void };
  Circle: new (options: object) => { setMap(map: unknown): void };
}

let googleLoading: Promise<GoogleMaps> | null = null;

function loadGoogle(key: string): Promise<GoogleMaps> {
  googleLoading ??= new Promise<GoogleMaps>((resolve, reject) => {
    const name = `pdGoogleMaps${Date.now()}`;
    const global = window as unknown as Record<string, unknown>;
    global[name] = () => resolve((global['google'] as { maps: GoogleMaps }).maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${name}`;
    script.async = true;
    script.onerror = () => {
      googleLoading = null;
      reject(new Error('Google Maps did not load'));
    };
    document.head.append(script);
  });
  return googleLoading;
}

async function googleMap(element: HTMLElement, key: string): Promise<Renderer> {
  const maps = await loadGoogle(key);
  const map = new maps.Map(element, { center: { lat: 52.23, lng: 21.01 }, zoom: 11 });
  let drawn: { setMap(map: unknown): void }[] = [];
  return {
    draw(stays, trips) {
      drawn.forEach((shape) => shape.setMap(null));
      drawn = [];
      const bounds = new maps.LatLngBounds();
      for (const trip of trips) {
        const path = trip.path.map(([lat, lng]) => ({ lat, lng }));
        drawn.push(
          new maps.Polyline({ map, path, strokeColor: COLORS[trip.mode], strokeWeight: 4 }),
        );
        path.forEach((point) => bounds.extend(point));
      }
      for (const stay of stays) {
        const center = { lat: stay.latitude, lng: stay.longitude };
        drawn.push(
          new maps.Circle({
            map,
            center,
            radius: stay.ofDay ? 40 : 25,
            strokeColor: stay.ofDay ? '#6a1b9a' : '#9e9e9e',
            fillColor: stay.ofDay ? '#6a1b9a' : '#9e9e9e',
            fillOpacity: 0.5,
          }),
        );
        bounds.extend(center);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
      }
    },
    destroy: () => drawn.forEach((shape) => shape.setMap(null)),
  };
}

/**
 * The map of Activity → Places: the day's routes as lines (green on foot, orange by bike, blue
 * riding), its stays as marks with their names, and the places of the last 30 days faint.
 * OpenStreetMap by default — the tiles tell its servers which area is looked at; Google Maps
 * with the user's own key.
 */
@Component({
  selector: 'pd-places-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #map class="map"></div>`,
  styles: `
    .map {
      height: 360px;
      border-radius: 12px;
      overflow: hidden;
      z-index: 0;
    }
  `,
})
export class PlacesMapComponent {
  readonly entries = input.required<PlacesEntry[]>();
  readonly frequent = input<FrequentPlace[]>([]);
  /** A stay's name as the page shows it. */
  readonly labelOf =
    input.required<(stay: { name: string | null; found: { name: string } | null }) => string>();
  /** `null` — OpenStreetMap. */
  readonly googleKey = input<string | null>(null);

  private readonly element = viewChild.required<ElementRef<HTMLElement>>('map');
  private renderer: Renderer | null = null;
  private rendererKey: string | null | undefined;

  constructor() {
    let ready = false;
    afterNextRender(() => {
      ready = true;
      void this.redraw();
    });
    effect(() => {
      // Read here, so the map follows the day and the switch.
      this.entries();
      this.frequent();
      this.googleKey();
      if (ready) {
        void this.redraw();
      }
    });
    inject(DestroyRef).onDestroy(() => this.renderer?.destroy());
  }

  private async redraw(): Promise<void> {
    const key = this.googleKey();
    if (!this.renderer || this.rendererKey !== key) {
      this.renderer?.destroy();
      this.element().nativeElement.replaceChildren();
      this.rendererKey = key;
      this.renderer = await (key
        ? googleMap(this.element().nativeElement, key).catch(() =>
            leaflet(this.element().nativeElement),
          )
        : leaflet(this.element().nativeElement));
    }
    const label = this.labelOf();
    const stays: MapStay[] = [
      ...this.frequent().map((place) => ({
        latitude: place.latitude,
        longitude: place.longitude,
        label: label(place),
        ofDay: false,
      })),
      ...this.entries()
        .filter((entry) => entry.kind === 'stay')
        .map((stay) => ({
          latitude: stay.latitude,
          longitude: stay.longitude,
          label: label(stay),
          ofDay: true,
        })),
    ];
    const trips: MapTrip[] = this.entries().flatMap((entry) =>
      entry.kind === 'trip' ? [{ path: entry.path, mode: entry.mode }] : [],
    );
    this.renderer.draw(stays, trips);
  }
}
