const Sentry = require('../lib/sentry');
const { buildLoginUrl, verifyAssertion } = require('../lib/steamOpenId');

// Two modes on one endpoint, same `?mode=`/`?when=`-style dispatch
// convention as api/games.js. Both are real HTTP redirects, never a JSON
// response - a browser (expo-web-browser's openAuthSessionAsync on the app
// side) is what's open for this whole flow, not a fetch() call, so there's
// nothing on the other end to parse JSON.
//
// mode=login: send the user to Steam's own login page.
// mode=callback: Steam redirects back here after login; verify its
// assertion and hand the result to the app via its own gamingviews://
// scheme - success or failure, always that same shape, so the app's deep
// link handler (app/_layout.js) has exactly one thing to parse regardless
// of outcome.
const APP_CALLBACK_SCHEME = 'gamingviews://steam-callback';

module.exports = async function handler(req, res) {
  const mode = req.query && req.query.mode;

  if (mode === 'callback') {
    try {
      const steamId = await verifyAssertion(req.query || {});
      if (!steamId) {
        return res.redirect(302, `${APP_CALLBACK_SCHEME}?error=verification_failed`);
      }
      return res.redirect(302, `${APP_CALLBACK_SCHEME}?steamid=${encodeURIComponent(steamId)}`);
    } catch (err) {
      Sentry.captureException(err);
      await Sentry.flush(2000);
      return res.redirect(302, `${APP_CALLBACK_SCHEME}?error=server_error`);
    }
  }

  // Default/mode=login.
  try {
    return res.redirect(302, buildLoginUrl(req));
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return res.status(500).json({ error: err.message });
  }
};
