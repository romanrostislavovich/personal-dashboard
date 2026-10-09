/**
 * When a GitHub token expires, as GitHub tells it in the header of any answer
 * (`github-authentication-token-expiration: 2026-11-01 00:00:00 UTC`); `null` — the token has
 * no expiry, or the header is not what was expected.
 */
export function githubTokenExpiry(header: string | null): Date | null {
  const match = header?.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/);
  return match ? new Date(`${match[1]}T${match[2]}Z`) : null;
}

/**
 * When a GitLab token expires: `expires_at` of `/personal_access_tokens/self` is a day, and the
 * token stops working when that day begins (UTC). `null` — it does not expire.
 */
export function gitlabTokenExpiry(expiresAt: string | null | undefined): Date | null {
  return expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt)
    ? new Date(`${expiresAt}T00:00:00Z`)
    : null;
}
