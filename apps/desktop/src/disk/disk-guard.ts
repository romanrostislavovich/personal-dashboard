import { homedir } from 'node:os';
import { basename, dirname, join, parse, sep } from 'node:path';

/**
 * What the app never moves to the Recycle Bin, whatever the advice says: the system, programs,
 * the user's top folders themselves (their contents may go), virtual disks of WSL and Docker
 * (a whole Linux lives in them) and system files.
 */
export function isProtected(path: string, appFolders: string[]): boolean {
  const target = normalize(path);
  const root = normalize(parse(target).root);
  const home = normalize(homedir());
  const systemRoot = normalize(process.env['SystemRoot'] ?? join(root, 'Windows'));

  const exact = [
    root,
    home,
    join(home, 'AppData'),
    join(home, 'AppData', 'Local'),
    join(home, 'AppData', 'Roaming'),
    join(home, 'AppData', 'LocalLow'),
    ...['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'OneDrive'].map(
      (name) => join(home, name),
    ),
    join(root, 'Users'),
  ].map(normalize);
  if (exact.includes(target)) {
    return true;
  }

  const inside = [
    systemRoot,
    join(root, 'Program Files'),
    join(root, 'Program Files (x86)'),
    join(root, 'ProgramData'),
    join(root, '$Recycle.Bin'),
    join(root, 'System Volume Information'),
    join(root, 'Recovery'),
    join(root, 'Boot'),
    // Docker and the store apps (WSL among them) keep whole virtual disks there.
    join(home, 'AppData', 'Local', 'Docker'),
    join(home, 'AppData', 'Local', 'Packages'),
    join(home, 'AppData', 'Local', 'wsl'),
    ...appFolders,
  ].map(normalize);
  if (inside.some((folder) => target === folder || target.startsWith(folder + sep))) {
    return true;
  }

  const name = basename(target);
  if (/\.(sys|vhdx?|avhdx)$/i.test(name)) {
    return true;
  }
  // A file right in the root of a disk (pagefile, hiberfil, boot files) belongs to the system.
  return dirname(target) === root;
}

function normalize(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return (trimmed.length <= 2 ? trimmed + sep : trimmed).toLowerCase();
}
