// PLACEHOLDER — replace both lists with the trailers observed in the wild.
// Domains match the identity's email; names match its display name.
export const AI_EMAIL_DOMAINS = ['anthropic.com'];
export const AI_NAMES = ['Claude'];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Boundaries are alphanumeric rather than \b so a name carrying `[bot]`, a
// hyphen, or a version number still matches on its own terms.
const NAME_MATCHERS = AI_NAMES.map((name) => new RegExp(`(?<![a-z0-9])${escape(name)}(?![a-z0-9])`, 'i'));

/**
 * Split a footer value into its display name and email domain.
 *
 * Trailers in the wild often carry no `<email>` — `Generated-by: Claude Opus
 * 4.8` is as common as the addressed form.
 *
 * @param {string} value the footer value
 * @returns {{name: string, domain: string}} display name and lowercased email domain
 */
export function parseIdentity(value) {
  const addressed = /^(.*?)\s*<([^>]*)>\s*$/.exec(value);
  const name = (addressed ? addressed[1] : value).trim();
  const email = addressed ? addressed[2] : '';
  const domain = email.includes('@') ? email.split('@').pop().toLowerCase() : '';
  return { name, domain };
}

/**
 * Decide whether a footer value names a known AI tool.
 *
 * @param {string} value the footer value, with or without an `<email>`
 * @returns {boolean} true when the identity is a known AI tool
 */
export function isKnownAiIdentity(value) {
  const { name, domain } = parseIdentity(value);

  // a parent domain counts, so `bot.example.com` resolves through `example.com`
  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    if (AI_EMAIL_DOMAINS.includes(labels.slice(i).join('.'))) return true;
  }

  return NAME_MATCHERS.some((matcher) => matcher.test(name));
}
