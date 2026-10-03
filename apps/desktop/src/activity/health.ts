import { existsSync, statfsSync } from 'node:fs';
import { cpus, freemem, totalmem, uptime } from 'node:os';

/** The computer's state, as the server takes it (activityHealthSchema in contracts). */
export interface HealthSnapshot {
  at: string;
  cpu: number;
  memoryUsed: number;
  memoryTotal: number;
  uptimeSeconds: number;
  disks: { mount: string; total: number; free: number }[];
}

type CpuTimes = { idle: number; total: number };

/**
 * Takes the computer's state: processor load since the previous reading, memory, the time
 * since the last restart and the free space of every drive. Plain Node, no external tools.
 */
export class HealthCollector {
  private previous: CpuTimes = cpuTimes();

  collect(): HealthSnapshot {
    const now = cpuTimes();
    const total = now.total - this.previous.total;
    const busy = total > 0 ? 1 - (now.idle - this.previous.idle) / total : 0;
    this.previous = now;
    return {
      at: new Date().toISOString(),
      cpu: Math.round(Math.min(1, Math.max(0, busy)) * 1000) / 10,
      memoryUsed: totalmem() - freemem(),
      memoryTotal: totalmem(),
      uptimeSeconds: Math.round(uptime()),
      disks: drives(),
    };
  }
}

function cpuTimes(): CpuTimes {
  return cpus().reduce(
    (sum, cpu) => {
      const times = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return { idle: sum.idle + cpu.times.idle, total: sum.total + times };
    },
    { idle: 0, total: 0 },
  );
}

/** Windows: every lettered drive; elsewhere the root. A drive that cannot be read is left out. */
function drives(): HealthSnapshot['disks'] {
  const mounts =
    process.platform === 'win32'
      ? 'CDEFGHIJKLMNOPQRSTUVWXYZ'
          .split('')
          .map((letter) => `${letter}:`)
          .filter((mount) => existsSync(`${mount}\\`))
      : ['/'];
  return mounts.flatMap((mount) => {
    try {
      const stats = statfsSync(process.platform === 'win32' ? `${mount}\\` : mount);
      const total = stats.blocks * stats.bsize;
      return total > 0 ? [{ mount, total, free: stats.bavail * stats.bsize }] : [];
    } catch {
      return []; // An empty card reader, a disconnected network drive.
    }
  });
}
