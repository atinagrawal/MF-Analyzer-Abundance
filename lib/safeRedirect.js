/**
 * lib/safeRedirect.js
 *
 * Validates a `from`/callbackUrl-style query param intended for a
 * post-auth client-side redirect (window.location.href = ...). Only a
 * same-origin relative path is safe here -- an absolute URL or a
 * protocol-relative "//host/path" would send the user off-site right
 * after they authenticate, a classic open-redirect phishing vector (e.g.
 * a crafted /login?from=https://evil.com or /complete-profile?from=//evil.com
 * link). Falls back to '/' for anything else, including malformed input.
 */
function sanitizeRedirectPath(raw) {
  if (typeof raw !== 'string' || !raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'; // protocol-relative / backslash bypass
  return raw;
}

export { sanitizeRedirectPath };
