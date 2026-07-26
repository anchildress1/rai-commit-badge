// Bots confirmed not to be AI authorship. Checked first and short-circuits, so a
// handle here can never be rescued by a name or domain match.
export const NON_AI_IDENTITIES = [
  'all-contributors-bot',
  'codecov[bot]',
  'dependabot-preview[bot]',
  'dependabot[bot]',
  'depfu[bot]',
  'github-actions[bot]',
  'imgbot[bot]',
  'mergify[bot]',
  'pre-commit-ci[bot]',
  'release-please[bot]',
  'renovate[bot]',
  'semantic-release-bot',
  'snyk-bot',
  'stale[bot]',
];

// Tool names — the stronger signal. `copilot@github.com` and `noreply@google.com`
// are AI trailers on domains thousands of humans also send from, so only the name
// separates them.
//
// Bare `Amp`, `Oz`, `Cody`, `Devin`, `Jules`, and `Continue` are deliberately
// absent: each is a common word or human given name, and matching them would
// score real people as tools. Their bot handles and vendor domains cover them.
export const AI_NAMES = [
  'aider',
  'ampcode',
  'anthropic-code-agent',
  'Antigravity',
  'Augment Agent',
  'ChatGPT',
  'Claude',
  'Cline',
  'CodeRabbit',
  'Codeium',
  'Codex',
  'Copilot',
  'Cursor',
  'Devin AI',
  'devin-ai-integration',
  'factory-droid',
  'Gemini',
  'github-advanced-security',
  'github-code-quality',
  'google-labs-jules',
  'GPT',
  'Junie',
  'Kilo Code',
  'Kiro',
  'Ona',
  'opencode',
  'OpenHands',
  'oz-agent',
  'Qodo',
  'Roo Code',
  'SWE-agent',
  'Tabnine',
  'Verdent',
  'Windsurf',
  'Zencoder',
];

// Vendor domains — the weaker signal, and the reason the list is short. Tools
// invent a fresh address most runs: Verdent alone has signed from twelve domains
// including `anthropic.com`, so a domain can name the wrong vendor and still be
// AI. Only domains no human sends commit mail from belong here.
export const AI_EMAIL_DOMAINS = [
  'aider.chat',
  'all-hands.dev',
  'ampcode.com',
  'anthropic.com',
  'antigravity.ai',
  'antigravity.dev',
  'cursor.com',
  'jules.com',
  'kiro.ai',
  'kiro.dev',
  'ona.com',
  'opencode.ai',
  'verdent.ai',
  // Warp signs as `Oz <oz-agent@warp.dev>` — the handle lives in the address, so
  // the display name alone never identifies it
  'warp.dev',
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Boundaries are alphanumeric rather than \b so a term carrying `[bot]`, a
// hyphen, or a version number still matches on its own terms.
const matcher = (term) => new RegExp(`(?<![a-z0-9])${escape(term)}(?![a-z0-9])`, 'i');

const NON_AI_MATCHERS = NON_AI_IDENTITIES.map(matcher);
const AI_NAME_MATCHERS = AI_NAMES.map(matcher);

const ADDRESS = /<([^>]*)>/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/**
 * Test a string for any of `terms`, on alphanumeric boundaries.
 *
 * @param {string} subject the text to search
 * @param {string[]} terms literal terms; regex metacharacters are escaped
 * @returns {boolean} true when any term appears
 */
export function matchesAnyName(subject, terms) {
  return terms.some((term) => matcher(term).test(subject));
}

/**
 * Split a footer value into its display name and email domain.
 *
 * Real trailers are messier than `Name <email>`: many carry no address at all,
 * some omit the space before `<`, and some put a URL in the address slot.
 *
 * @param {string} value the footer value
 * @returns {{raw: string, name: string, domain: string}} the trimmed value, the
 *   text before the address, and the lowercased domain — empty unless the
 *   address slot held a well-formed email
 */
export function parseIdentity(value) {
  const raw = value.trim();
  const found = ADDRESS.exec(raw);

  // a trailing backslash turns up where a URL was pasted into the address slot
  const address = found ? found[1].trim().replace(/\\+$/, '') : '';
  const domain = EMAIL.test(address) ? address.split('@').pop().toLowerCase() : '';
  const name = found ? raw.slice(0, found.index).trim() : raw;

  return { raw, name, domain };
}

/**
 * Decide whether a footer value names a known AI tool.
 *
 * Precedence: the non-AI denylist, then tool names, then vendor domains.
 *
 * @param {string} value the footer value, in any shape
 * @returns {boolean} true when the identity is a known AI tool
 */
export function isKnownAiIdentity(value) {
  const { raw, name, domain } = parseIdentity(value);

  if (NON_AI_MATCHERS.some((m) => m.test(raw))) return false;

  // without a usable domain the name is unreliable — a multi-tool or prose value
  // holds its tools outside the name, so the whole value is the subject
  const subject = domain ? name : raw;
  if (AI_NAME_MATCHERS.some((m) => m.test(subject))) return true;

  // a parent domain counts, so `bot.example.com` resolves through `example.com`
  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    if (AI_EMAIL_DOMAINS.includes(labels.slice(i).join('.'))) return true;
  }

  return false;
}
