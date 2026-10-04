// Steam has no modern OAuth2/OIDC - account login is Steam's own OpenID 2.0
// provider. The whole flow is: redirect the user to Steam's login page with
// a few fixed params, Steam redirects back with a signed assertion, and we
// verify that assertion by POSTing the same params back to Steam with
// mode=check_authentication. No API key anywhere in this file - this is a
// call to Steam's own OpenID endpoint, not the Steam Web API (that's a
// separate, keyed API this feature doesn't use at all - see
// lib/steamWishlist.js's own comment on why the wishlist fetch needs no key
// either).
const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
// Steam doesn't let the user pick which of their (they only ever have one)
// identities to share - "identifier_select" tells the provider to resolve
// it automatically, same convention OpenID 2.0 uses for any provider that
// manages a single identity per account.
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

// Builds the full external base URL (e.g. https://my-preview.vercel.app)
// from the incoming request rather than a hardcoded constant, so this works
// unchanged on production, on any Vercel preview deployment for this
// branch, and locally via `vercel dev` + a tunnel - Steam needs a real,
// reachable return_to URL regardless of which of those this is running as.
function baseUrlFromRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Builds the URL to redirect the user to in order to start the Steam login.
// `returnTo` is this same backend's own callback URL (api/steam-auth.js's
// mode=callback) - Steam redirects back there with the signed assertion.
function buildLoginUrl(req) {
  const baseUrl = baseUrlFromRequest(req);
  const returnTo = `${baseUrl}/api/steam-auth?mode=callback`;
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': baseUrl,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

// Verifies a returned assertion by posting the same openid.* params Steam
// sent back, with mode switched to check_authentication - Steam's documented
// way (same as any OpenID 2.0 provider) of confirming a signature it issued
// rather than trusting the redirect's query params at face value. Returns
// the verified SteamID64 on success, or null on any failure (invalid
// signature, network error, missing claimed_id) - callers treat null as
// "login failed," not a crash.
async function verifyAssertion(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('openid.')) params.set(key, value);
  }
  params.set('openid.mode', 'check_authentication');

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) return null;

  const body = await response.text();
  if (!/is_valid\s*:\s*true/.test(body)) return null;

  // claimed_id looks like https://steamcommunity.com/openid/id/76561198012345678
  // - the trailing numeric path segment is the SteamID64.
  const claimedId = query['openid.claimed_id'];
  const match = typeof claimedId === 'string' && claimedId.match(/\/id\/(\d+)$/);
  return match ? match[1] : null;
}

module.exports = { buildLoginUrl, verifyAssertion };
