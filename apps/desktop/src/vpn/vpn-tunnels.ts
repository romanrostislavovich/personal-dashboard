/**
 * The dashboard's own tunnels of AmneziaWG on this computer (see vpn-control.ts). Two services
 * from the same device config, set up once with the administrator's consent:
 * - `dashboard` sends everything through the VPN — AmneziaWG then blocks whatever would go
 *   around it, so the internet is off while the VPN is down (the owner's "kill switch");
 * - `dashboard-open` sends the same, written as two halves of the address space — AmneziaWG
 *   sees no `/0` and blocks nothing, so the internet stays when the VPN fails.
 */
export const TUNNELS = {kill: 'dashboard', open: 'dashboard-open'} as const;
export type TunnelName = (typeof TUNNELS)[keyof typeof TUNNELS];

/** AmneziaWG names a tunnel's Windows service after it. */
export const SERVICE_PREFIX = 'AmneziaWGTunnel$';

export function serviceOf(tunnel: string): string {
  return `${SERVICE_PREFIX}${tunnel}`;
}

const ALLOWED_IPS = /^AllowedIPs\s*=.*$/m;
/** The whole address space without a `/0` in it. */
const HALVES = 'AllowedIPs = 0.0.0.0/1, 128.0.0.0/1, ::/1, 8000::/1';
const LINE_BREAK = /\r?\n/;

/** The keys a device's config has (deviceConfig on the server) — and nothing that runs a command. */
const CONFIG_KEYS = new Set([
  '[Interface]',
  '[Peer]',
  '',
  'PrivateKey',
  'Address',
  'DNS',
  'MTU',
  'Jc',
  'Jmin',
  'Jmax',
  'S1',
  'S2',
  'H1',
  'H2',
  'H3',
  'H4',
  'PublicKey',
  'PresharedKey',
  'Endpoint',
  'AllowedIPs',
  'PersistentKeepalive',
]);

/**
 * The two configs of a device's config text. Throws on a text that is not a device's config:
 * it is written for a service of the system, so a PostUp (a command run as the system) never
 * gets in.
 */
export function tunnelConfigs(config: string): Record<TunnelName, string> {
  for (const line of config.split(LINE_BREAK)) {
    const key = line.startsWith('[') ? line.trim() : line.split('=')[0].trim();
    if (!CONFIG_KEYS.has(key)) {
      throw new Error(`Not a VPN device config: ${key}`);
    }
  }
  if (!ALLOWED_IPS.test(config)) {
    throw new Error('Not a VPN device config: no AllowedIPs');
  }
  const kill = config.replace(ALLOWED_IPS, 'AllowedIPs = 0.0.0.0/0, ::/0');
  return {
    [TUNNELS.kill]: kill,
    [TUNNELS.open]: kill.replace(ALLOWED_IPS, HALVES),
  };
}

export type ServiceState = 'running' | 'stopped' | 'starting' | 'stopping';

/**
 * A service's state from PowerShell's `(Get-Service …).Status` — the same words in every
 * language of Windows (`sc query` prints them translated); `null` — no such service.
 */
export function parseServiceStatus(output: string): ServiceState | null {
  switch (output.trim()) {
    case 'Running':
      return 'running';
    case 'StartPending':
      return 'starting';
    case 'StopPending':
      return 'stopping';
    case 'Stopped':
      return 'stopped';
    default:
      return null;
  }
}

/** The tunnels of AmneziaWG running now, from the names of their running services. */
export function runningTunnels(serviceNames: string): string[] {
  return serviceNames
    .split(LINE_BREAK)
    .map(line => line.trim())
    .filter(name => name.startsWith(SERVICE_PREFIX))
    .map(name => name.slice(SERVICE_PREFIX.length));
}

/** A Windows account's SID, as `whoami /user /fo csv /nh` prints it. */
export function parseSid(output: string): string | null {
  return /"(S-1-[\d-]+)"/.exec(output)?.[1] ?? null;
}

/**
 * The entry of a service's security descriptor that lets the user start, stop and query it
 * (RP, WP, LC, LO, CR, RC) — so switching the VPN needs no administrator after the setup.
 */
export function startStopAce(sid: string): string {
  return `(A;;RPWPLCLOCRRC;;;${sid})`;
}

/** A PowerShell string literal: single quotes, a quote inside doubled. */
function quoted(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

export interface SetupPlan {
  /** `amneziawg.exe`. */
  awg: string;
  /** Where the configs are kept: readable by the system and administrators only. */
  dir: string;
  /** The folder the configs were written to before the elevation (removed by the script). */
  staged: string;
  /** The user who may then switch the tunnels. */
  sid: string;
}

/**
 * The script run once as administrator: the configs moved where only the system reads them,
 * each tunnel installed as a service (AmneziaWG starts it — it is stopped at once), started by
 * hand only, and the user allowed to start and stop it. A tunnel of the same name is replaced.
 */
export function setupScript(plan: SetupPlan): string {
  const tunnels = Object.values(TUNNELS);
  return [
    "$ErrorActionPreference = 'Stop'",
    `$awg = ${quoted(plan.awg)}`,
    `$dir = ${quoted(plan.dir)}`,
    `$staged = ${quoted(plan.staged)}`,
    `$ace = ${quoted(startStopAce(plan.sid))}`,
    'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    // SYSTEM and Administrators by SID: the names are translated on a Russian Windows.
    'icacls $dir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null',
    `foreach ($name in @(${tunnels.map(quoted).join(', ')})) {`,
    "  $service = 'AmneziaWGTunnel$' + $name",
    '  if (Get-Service -Name $service -ErrorAction SilentlyContinue) {',
    '    & $awg /uninstalltunnelservice $name | Out-Null',
    '    Start-Sleep -Seconds 2',
    '  }',
    "  Copy-Item -Force (Join-Path $staged ($name + '.conf')) (Join-Path $dir ($name + '.conf'))",
    "  & $awg /installtunnelservice (Join-Path $dir ($name + '.conf')) | Out-Null",
    '  for ($i = 0; $i -lt 30 -and -not (Get-Service -Name $service -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }',
    '  Stop-Service -Name $service -Force -ErrorAction SilentlyContinue',
    '  sc.exe config $service start= demand | Out-Null',
    "  $sd = (sc.exe sdshow $service | Where-Object { $_ }) -join ''",
    '  if ($sd -notlike "*$ace*") {',
    "    $at = $sd.IndexOf('S:')",
    '    $new = if ($at -ge 0) { $sd.Insert($at, $ace) } else { $sd + $ace }',
    '    sc.exe sdset $service $new | Out-Null',
    '  }',
    '}',
    'Remove-Item -Recurse -Force $staged',
    '',
  ].join('\r\n');
}

/** The script that takes the tunnels away again, as administrator. */
export function removeScript(plan: Pick<SetupPlan, 'awg' | 'dir'>): string {
  return [
    "$ErrorActionPreference = 'Continue'",
    `$awg = ${quoted(plan.awg)}`,
    `foreach ($name in @(${Object.values(TUNNELS).map(quoted).join(', ')})) {`,
    "  if (Get-Service -Name ('AmneziaWGTunnel$' + $name) -ErrorAction SilentlyContinue) {",
    '    & $awg /uninstalltunnelservice $name | Out-Null',
    '  }',
    '}',
    `Remove-Item -Recurse -Force ${quoted(plan.dir)} -ErrorAction SilentlyContinue`,
    '',
  ].join('\r\n');
}
