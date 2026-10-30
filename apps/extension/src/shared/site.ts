/*
 * Which saved logins belong to a page. A login keeps its addresses (`urls`); a page matches it
 * when both are on the same site — the same registrable domain: mail.google.com and
 * accounts.google.com are one site, google.com and google.com.evil.io are not.
 *
 * Without the full Public Suffix List the site is the last two labels of the host, or three
 * under a country's second level (example.co.uk, example.com.ua) and under hosting shared by
 * many owners (alice.github.io and bob.github.io are two sites). An address, `localhost` and a
 * single label match only the same host and port.
 *
 * A login saved for https is never given to an http page: on plain http anyone on the way
 * would read it.
 */

/** Second levels of country domains that are not a site by themselves (`co` of `co.uk`). */
const COUNTRY_SECOND_LEVELS = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'gov',
  'in',
  'ltd',
  'net',
  'org',
  'plc',
]);

/** Domains whose subdomains belong to different people. */
const SHARED_HOSTING = new Set([
  'appspot.com',
  'azurewebsites.net',
  'blogspot.com',
  'cloudfront.net',
  'firebaseapp.com',
  'fly.dev',
  'github.io',
  'gitlab.io',
  'herokuapp.com',
  'netlify.app',
  'onrender.com',
  'pages.dev',
  'vercel.app',
  'web.app',
  'workers.dev',
]);

export interface Site {
  secure: boolean;
  /** The registrable domain (`google.com`), or the host with its port (`localhost:3300`). */
  site: string;
  /** `https://mail.google.com` */
  origin: string;
}

/** The site of an address; one typed without a scheme (`example.com`) is taken as https. */
export function siteOf(url: string): Site | null {
  let parsed: URL;
  try {
    parsed = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(url.trim())
        ? url.trim()
        : `https://${url.trim()}`,
    );
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  return {
    secure: parsed.protocol === 'https:',
    site: isAddressLike(host) ? parsed.host.toLowerCase() : registrable(host),
    origin: parsed.origin,
  };
}

/** Whether a login saved for `saved` may be filled into `page`. */
export function sameSite(page: string, saved: string): boolean {
  const a = siteOf(page);
  const b = siteOf(saved);
  return !!a && !!b && a.site === b.site && (a.secure || !b.secure);
}

/** Whether any of a login's addresses fits the page. */
export function matchesPage(urls: readonly string[], page: string): boolean {
  return urls.some(url => sameSite(page, url));
}

/** A name for a site in a title or a message: the host without `www.`. */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function isAddressLike(host: string): boolean {
  return !host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[');
}

function registrable(host: string): string {
  const labels = host.split('.');
  const lastTwo = labels.slice(-2).join('.');
  const countrySecondLevel =
    labels.length >= 3 &&
    labels.at(-1)?.length === 2 &&
    COUNTRY_SECOND_LEVELS.has(labels.at(-2) ?? '');
  const take = countrySecondLevel || SHARED_HOSTING.has(lastTwo) ? 3 : 2;
  return labels.slice(-take).join('.');
}
