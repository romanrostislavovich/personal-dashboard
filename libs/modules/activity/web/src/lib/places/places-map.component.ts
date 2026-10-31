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
import {
  FrequentPlace,
  HeatCell,
  NamedPlace,
  PlacesEntry,
  TripMode,
} from '@pd/contracts';
import {mapApi} from '@pd/client-core';
import {DASHBOARD_CLIENT} from '@pd/web-core';

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

/** What one drawing of the map holds. */
interface MapLayers {
  stays: MapStay[];
  trips: MapTrip[];
  named: NamedPlace[];
  /** With the share of the busiest cell, 0–1. */
  heat: (HeatCell & {share: number})[];
}

/** A map that draws the day: Leaflet with OpenStreetMap, or Google Maps with the user's key. */
interface Renderer {
  draw(layers: MapLayers): void;
  destroy(): void;
}

type TileSource = (z: number, x: number, y: number) => Promise<Blob>;

const COLORS: Record<TripMode, string> = {
  walk: '#2e7d32',
  bike: '#ef6c00',
  ride: '#1565c0',
};
const NAMED_COLOR = '#00838f';
const HEAT_COLOR = '#d84315';
/** Half a heat cell in degrees (the server's cells are 0.0015°). */
const HEAT_HALF = 0.00075;

/** A cell's opacity: a short visit shows, the place of most hours is the strongest. */
function heatOpacity(share: number): number {
  return 0.15 + 0.6 * Math.sqrt(share);
}

async function leaflet(
  element: HTMLElement,
  tiles: TileSource,
): Promise<Renderer> {
  const module = await import('leaflet');
  // Leaflet is CommonJS: a dynamic import hands it over as `default`.
  const L = (module as unknown as {default?: typeof module}).default ?? module;
  const map = L.map(element, {zoomControl: true, attributionControl: true});
  // The tiles come through the dashboard (MapTilesService), with the session: OpenStreetMap
  // never sees who looks at which streets.
  const Tiles = L.GridLayer.extend({
    createTile(
      coords: {x: number; y: number; z: number},
      done: (error: Error | null, tile: HTMLElement) => void,
    ) {
      const img = document.createElement('img');
      img.alt = '';
      tiles(coords.z, coords.x, coords.y)
        .then(blob => {
          const url = URL.createObjectURL(blob);
          img.onload = () => {
            URL.revokeObjectURL(url);
            done(null, img);
          };
          img.src = url;
        })
        .catch(error => done(error as Error, img));
      return img;
    },
  }) as unknown as new (options: object) => InstanceType<typeof L.GridLayer>;
  new Tiles({
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  return {
    draw({stays, trips, named, heat}) {
      layer.clearLayers();
      const bounds: [number, number][] = [];
      // The heat first: the routes and the marks are drawn over it.
      for (const cell of heat) {
        L.rectangle(
          [
            [cell.latitude - HEAT_HALF, cell.longitude - HEAT_HALF],
            [cell.latitude + HEAT_HALF, cell.longitude + HEAT_HALF],
          ],
          {
            stroke: false,
            fillColor: HEAT_COLOR,
            fillOpacity: heatOpacity(cell.share),
          },
        ).addTo(layer);
      }
      // The view follows the busiest cells, not a stray fix far away.
      bounds.push(
        ...heat
          .filter(cell => cell.share >= 0.02)
          .map(cell => [cell.latitude, cell.longitude] as [number, number]),
      );
      for (const trip of trips) {
        L.polyline(trip.path, {
          color: COLORS[trip.mode],
          weight: 4,
          opacity: 0.85,
        }).addTo(layer);
        bounds.push(...trip.path);
      }
      for (const place of named) {
        L.circle([place.latitude, place.longitude], {
          radius: place.radiusM,
          color: NAMED_COLOR,
          weight: 2,
          fillOpacity: 0.08,
        })
          .bindTooltip(place.name)
          .addTo(layer);
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
      if (!bounds.length) {
        bounds.push(
          ...named.map(p => [p.latitude, p.longitude] as [number, number]),
        );
      }
      if (bounds.length) {
        map.fitBounds(bounds, {padding: [24, 24], maxZoom: 16});
      } else {
        map.setView([52.23, 21.01], 11);
      }
    },
    destroy: () => map.remove(),
  };
}

/** The little of Google Maps' API used here (no types package for one component). */
interface GoogleMaps {
  Map: new (
    element: HTMLElement,
    options: object,
  ) => {fitBounds(bounds: object): void};
  LatLngBounds: new () => {extend(point: object): void; isEmpty(): boolean};
  Polyline: new (options: object) => {setMap(map: unknown): void};
  Circle: new (options: object) => {setMap(map: unknown): void};
  Rectangle: new (options: object) => {setMap(map: unknown): void};
}

let googleLoading: Promise<GoogleMaps> | null = null;

function loadGoogle(key: string): Promise<GoogleMaps> {
  googleLoading ??= new Promise<GoogleMaps>((resolve, reject) => {
    const name = `pdGoogleMaps${Date.now()}`;
    const global = window as unknown as Record<string, unknown>;
    global[name] = () => resolve((global['google'] as {maps: GoogleMaps}).maps);
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
  const map = new maps.Map(element, {
    center: {lat: 52.23, lng: 21.01},
    zoom: 11,
  });
  let drawn: {setMap(map: unknown): void}[] = [];
  return {
    draw({stays, trips, named, heat}) {
      drawn.forEach(shape => shape.setMap(null));
      drawn = [];
      const bounds = new maps.LatLngBounds();
      for (const cell of heat) {
        drawn.push(
          new maps.Rectangle({
            map,
            bounds: {
              south: cell.latitude - HEAT_HALF,
              north: cell.latitude + HEAT_HALF,
              west: cell.longitude - HEAT_HALF,
              east: cell.longitude + HEAT_HALF,
            },
            strokeWeight: 0,
            fillColor: HEAT_COLOR,
            fillOpacity: heatOpacity(cell.share),
          }),
        );
        if (cell.share >= 0.02) {
          bounds.extend({lat: cell.latitude, lng: cell.longitude});
        }
      }
      for (const trip of trips) {
        const path = trip.path.map(([lat, lng]) => ({lat, lng}));
        drawn.push(
          new maps.Polyline({
            map,
            path,
            strokeColor: COLORS[trip.mode],
            strokeWeight: 4,
          }),
        );
        path.forEach(point => bounds.extend(point));
      }
      for (const place of named) {
        drawn.push(
          new maps.Circle({
            map,
            center: {lat: place.latitude, lng: place.longitude},
            radius: place.radiusM,
            strokeColor: NAMED_COLOR,
            strokeWeight: 2,
            fillColor: NAMED_COLOR,
            fillOpacity: 0.08,
          }),
        );
      }
      for (const stay of stays) {
        const center = {lat: stay.latitude, lng: stay.longitude};
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
      if (bounds.isEmpty()) {
        named.forEach(p => bounds.extend({lat: p.latitude, lng: p.longitude}));
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
      }
    },
    destroy: () => drawn.forEach(shape => shape.setMap(null)),
  };
}

/**
 * The map of Activity → Places: the day's routes as lines (green on foot, orange by bike, blue
 * riding), its stays as marks with their names, the places of the last 30 days faint, the named
 * places as circles of their radius, and over a longer period where the time went (a heat map
 * of ~150 m cells). OpenStreetMap's tiles come through the dashboard; Google Maps with the
 * user's own key.
 */
@Component({
  selector: 'pd-places-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #map class="map"></div>',
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
  readonly named = input<NamedPlace[]>([]);
  readonly heat = input<HeatCell[]>([]);
  /** A stay's name as the page shows it. */
  readonly labelOf =
    input.required<
      (stay: {name: string | null; found: {name: string} | null}) => string
    >();
  /** `null` — OpenStreetMap. */
  readonly googleKey = input<string | null>(null);

  private readonly element = viewChild.required<ElementRef<HTMLElement>>('map');
  private readonly map = mapApi(inject(DASHBOARD_CLIENT).api);
  private renderer: Renderer | null = null;
  private rendererKey: string | null | undefined;

  constructor() {
    let ready = false;
    afterNextRender(() => {
      ready = true;
      void this.redraw();
    });
    effect(() => {
      // Read here, so the map follows the day, the period and the switch.
      this.entries();
      this.frequent();
      this.named();
      this.heat();
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
      const element = this.element().nativeElement;
      const tiles: TileSource = (z, x, y) => this.map.tile(z, x, y);
      this.renderer = await (key
        ? googleMap(element, key).catch(() => leaflet(element, tiles))
        : leaflet(element, tiles));
    }
    const label = this.labelOf();
    const stays: MapStay[] = [
      ...this.frequent().map(place => ({
        latitude: place.latitude,
        longitude: place.longitude,
        label: label(place),
        ofDay: false,
      })),
      ...this.entries()
        .filter(entry => entry.kind === 'stay')
        .map(stay => ({
          latitude: stay.latitude,
          longitude: stay.longitude,
          label: label(stay),
          ofDay: true,
        })),
    ];
    const trips: MapTrip[] = this.entries().flatMap(entry =>
      entry.kind === 'trip' ? [{path: entry.path, mode: entry.mode}] : [],
    );
    const busiest = Math.max(1, ...this.heat().map(cell => cell.minutes));
    this.renderer.draw({
      stays,
      trips,
      named: this.named(),
      heat: this.heat().map(cell => ({
        ...cell,
        share: cell.minutes / busiest,
      })),
    });
  }
}
