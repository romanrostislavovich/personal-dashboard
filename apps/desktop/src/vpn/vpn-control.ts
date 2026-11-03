import {app} from 'electron';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  parseServiceStatus,
  parseSid,
  removeScript,
  runningTunnels,
  serviceOf,
  setupScript,
  tunnelConfigs,
  TUNNELS,
  TunnelName,
} from './vpn-tunnels';

/** What the VPN page shows of this computer. */
export interface VpnLocalStatus {
  /** Windows with AmneziaWG installed. */
  available: boolean;
  /** Both tunnels of the dashboard are set up (the administrator agreed once). */
  installed: boolean;
  /** The dashboard's tunnel running now: `dashboard` (internet off when the VPN fails) or `dashboard-open`. */
  running: TunnelName | null;
  /** Tunnels of AmneziaWG started by hand (in its own window): two at once would fight. */
  others: string[];
}

export interface VpnActionResult {
  ok: boolean;
  /** Why not, in English (the page shows its own words for the common cases). */
  error?: string;
  /** The administrator's consent was not given. */
  canceled?: boolean;
}

const AWG = join(
  process.env['ProgramFiles'] ?? 'C:\\Program Files',
  'AmneziaWG',
  'amneziawg.exe',
);
const DIR = join(
  process.env['ProgramData'] ?? 'C:\\ProgramData',
  'PersonalDashboard',
  'vpn',
);
const WHOAMI = join(
  process.env['SystemRoot'] ?? 'C:\\Windows',
  'System32',
  'whoami.exe',
);
const TIMEOUT_MS = 2 * 60_000;

/**
 * The dashboard's VPN on this computer through AmneziaWG (see vpn-tunnels.ts): set up once with
 * the administrator's consent, then switched on and off by the user alone — from the page, and
 * later by a command from the server.
 */
export class VpnControl {
  async status(): Promise<VpnLocalStatus> {
    if (process.platform !== 'win32' || !existsSync(AWG)) {
      return {available: false, installed: false, running: null, others: []};
    }
    const states = await Promise.all(
      Object.values(TUNNELS).map(async tunnel => ({
        tunnel,
        state: parseServiceStatus(
          await powershell(
            `(Get-Service -Name '${serviceOf(tunnel)}' -ErrorAction SilentlyContinue).Status`,
          ),
        ),
      })),
    );
    const running = runningTunnels(
      await powershell(
        "Get-Service -Name 'AmneziaWGTunnel$*' | Where-Object Status -eq 'Running' | ForEach-Object Name",
      ),
    );
    const ours = new Set<string>(Object.values(TUNNELS));
    return {
      available: true,
      installed: states.every(item => item.state !== null),
      running: states.find(item => item.state === 'running')?.tunnel ?? null,
      others: running.filter(name => !ours.has(name)),
    };
  }

  /** Once, as administrator: the device's config becomes the two tunnels. */
  async setup(config: string): Promise<VpnActionResult> {
    let configs: Record<TunnelName, string>;
    try {
      configs = tunnelConfigs(config);
    } catch (error) {
      return {ok: false, error: String(error)};
    }
    // By its full path: a `whoami` of Git or MSYS on the PATH speaks another language.
    const sid = parseSid(await run(WHOAMI, ['/user', '/fo', 'csv', '/nh']));
    if (!sid) {
      return {ok: false, error: 'Unknown Windows user'};
    }
    const staged = join(app.getPath('temp'), `pd-vpn-${randomUUID()}`);
    await mkdir(staged, {recursive: true});
    try {
      for (const [name, text] of Object.entries(configs)) {
        await writeFile(join(staged, `${name}.conf`), text);
      }
      const script = join(staged, 'setup.ps1');
      await writeFile(script, setupScript({awg: AWG, dir: DIR, staged, sid}));
      return await elevated(script);
    } finally {
      // The script removes it too; an aborted run must not leave the key here.
      await rm(staged, {recursive: true, force: true});
    }
  }

  /** The tunnel of the choice on, the other off; no administrator needed after the setup. */
  async start(killSwitch: boolean): Promise<VpnActionResult> {
    const wanted = killSwitch ? TUNNELS.kill : TUNNELS.open;
    const other = killSwitch ? TUNNELS.open : TUNNELS.kill;
    return attempt(
      `Stop-Service -Name '${serviceOf(other)}' -ErrorAction SilentlyContinue; ` +
        `Start-Service -Name '${serviceOf(wanted)}'`,
    );
  }

  async stop(): Promise<VpnActionResult> {
    return attempt(
      Object.values(TUNNELS)
        .map(
          tunnel =>
            `Stop-Service -Name '${serviceOf(tunnel)}' -ErrorAction SilentlyContinue`,
        )
        .join('; '),
    );
  }

  /** The tunnels away, as administrator. */
  async remove(): Promise<VpnActionResult> {
    const staged = join(app.getPath('temp'), `pd-vpn-${randomUUID()}`);
    await mkdir(staged, {recursive: true});
    try {
      const script = join(staged, 'remove.ps1');
      await writeFile(script, removeScript({awg: AWG, dir: DIR}));
      return await elevated(script);
    } finally {
      await rm(staged, {recursive: true, force: true});
    }
  }
}

async function attempt(command: string): Promise<VpnActionResult> {
  try {
    await powershell(`$ErrorActionPreference = 'Stop'; ${command}`, true);
    return {ok: true};
  } catch (error) {
    return {ok: false, error: String(error)};
  }
}

/**
 * Runs a script as administrator: Windows asks the user (UAC) and waits. A refusal is
 * `canceled`, the script's own failure is its exit code.
 */
async function elevated(script: string): Promise<VpnActionResult> {
  try {
    const code = await powershell(
      'Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden ' +
        `-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${script.replace(/'/g, "''")}' | ` +
        'ForEach-Object ExitCode',
      true,
    );
    return code.trim() === '0'
      ? {ok: true}
      : {ok: false, error: `The setup ended with code ${code.trim()}`};
  } catch (error) {
    // "The operation was canceled by the user" — in the language of Windows, so by its code.
    return /1223|canceled|отмен/i.test(String(error))
      ? {ok: false, canceled: true}
      : {ok: false, error: String(error)};
  }
}

/** PowerShell's output; with `strict`, a failure throws (otherwise it is an empty answer). */
function powershell(command: string, strict = false): Promise<string> {
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    strict,
  );
}

function run(file: string, args: string[], strict = false): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {windowsHide: true, timeout: TIMEOUT_MS, encoding: 'utf8'},
      (error, stdout, stderr) => {
        if (error && strict) {
          reject(new Error(`${stderr || error.message}`.trim().slice(-400)));
          return;
        }
        resolve(stdout);
      },
    );
  });
}
