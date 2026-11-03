import {ApiError} from '@pd/client-core';

/**
 * The key of the words for a failed change: the server's `reason` when it gave one (a sync
 * client gets only the server's message, so 400 without it is said in general words).
 */
export function vpnErrorKey(error: unknown): string {
  // The VPN's requests go through the client core: a refusal is its ApiError, anything else
  // (a lost connection) has no answer at all.
  const body = error instanceof ApiError ? error.body : null;
  const reason =
    body && typeof body === 'object' && 'reason' in body ? body.reason : null;
  if (reason === 'full' || reason === 'no-server') {
    return `vpn.errors.${reason}`;
  }
  switch (error instanceof ApiError ? error.status : 0) {
    case 0:
      return 'vpn.errors.offline';
    case 400:
      return 'vpn.errors.refused';
    case 404:
      return 'vpn.errors.gone';
    default:
      return 'vpn.errors.generic';
  }
}

const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ў: 'u',
};

/**
 * The file name of a device's config. The AmneziaWG app names the tunnel after it and takes
 * Latin letters, digits, `-` and `_` only, up to 15: "Мой телефон" becomes `moy_telefon`.
 */
export function configFileName(name: string, kind: string): string {
  const latin = [...name.toLowerCase()]
    .map(char => CYRILLIC[char] ?? char)
    .join('')
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 15)
    .replace(/_+$/, '');
  return `${latin || `vpn-${kind}`}.conf`;
}
