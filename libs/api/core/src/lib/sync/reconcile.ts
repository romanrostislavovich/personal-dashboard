import { ReconcileMismatch, TableFingerprint } from '@pd/contracts';

/**
 * Tables whose contents differ between the two sides, by name. A table only one side has
 * (the other runs a different version) counts as well.
 */
export function compareFingerprints(
  local: Record<string, TableFingerprint>,
  server: Record<string, TableFingerprint>,
): ReconcileMismatch[] {
  const names = [...new Set([...Object.keys(local), ...Object.keys(server)])].sort();
  return names
    .filter((name) => local[name]?.hash !== server[name]?.hash)
    .map((name) => ({
      table: name,
      localRows: local[name]?.rows ?? null,
      serverRows: server[name]?.rows ?? null,
    }));
}
