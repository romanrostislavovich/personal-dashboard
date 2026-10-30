import {HeatCell} from '@pd/contracts';
import {Fix} from './stays';

/** A cell of the grid: ~150 m north to south (a degree of latitude is ~111 km). */
const CELL_DEG = 0.0015;
/** A fix stands for the time until the next one, at most this (a gap is not time spent there). */
const CREDIT_MS = 10 * 60_000;
/** The map draws at most this many: the busiest cells. */
const MAX_CELLS = 3000;

/**
 * Where the period was spent: the fixes (oldest first) summed into a grid, each giving its cell
 * the minutes until the next fix. Longitude cells are as wide in degrees as latitude ones — a
 * little narrower on the ground away from the equator, which a heat map does not mind.
 */
export function heatCells(fixes: Fix[]): HeatCell[] {
  const cells = new Map<string, {lat: number; lon: number; ms: number}>();
  fixes.forEach((fix, i) => {
    const next = fixes[i + 1];
    const ms = next ? Math.min(next.at - fix.at, CREDIT_MS) : CREDIT_MS;
    const lat = Math.floor(fix.latitude / CELL_DEG);
    const lon = Math.floor(fix.longitude / CELL_DEG);
    const key = `${lat}:${lon}`;
    const cell = cells.get(key) ?? {lat, lon, ms: 0};
    cell.ms += ms;
    cells.set(key, cell);
  });
  return [...cells.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_CELLS)
    .map(cell => ({
      // The middle of the cell.
      latitude: round((cell.lat + 0.5) * CELL_DEG),
      longitude: round((cell.lon + 0.5) * CELL_DEG),
      minutes: Math.round(cell.ms / 60_000),
    }))
    .filter(cell => cell.minutes > 0);
}

function round(degrees: number): number {
  return Math.round(degrees * 1e5) / 1e5;
}
