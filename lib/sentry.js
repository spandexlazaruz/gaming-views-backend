const Sentry = require('@sentry/node');

// DSNs are meant to be public and safe to embed directly — unlike the
// Twitch Client Secret, this isn't a credential that needs hiding in
// environment variables.
Sentry.init({
  dsn: 'https://9899655be9cab567d1ca4b0e6f329226@o4511915073601536.ingest.de.sentry.io/4511915161616464',
  tracesSampleRate: 0, // error monitoring only — no need for performance tracing at this scale
});

module.exports = Sentry;
