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
// AI. It carries the trailers no name reaches, such as
// `Nameless <noreply@anthropic.com>`.
//
// The tradeoff is deliberate: some of these are vendor corporate domains, so an
// employee of that vendor co-authoring by hand reads as a tool. That is rarer
// than an unrecognised tool name on a vendor address, which is what this catches.
// Keep the list to domains that exist to serve a tool; a general host such as
// `gmail.com` or `users.noreply.github.com` would misread everyone.
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

const escape = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

// Boundaries are alphanumeric rather than \b so a term carrying `[bot]`, a
// hyphen, or a version number still matches on its own terms.
const matcher = (term) => new RegExp(`(?<![a-z0-9])${escape(term)}(?![a-z0-9])`, 'i');

const NON_AI_MATCHERS = NON_AI_IDENTITIES.map(matcher);
const AI_NAME_MATCHERS = AI_NAMES.map(matcher);
// A non-vendor email disambiguates the common human name; name-only Claude
// trailers still need to match because many tools omit an address entirely.
const ADDRESSED_AI_NAME_MATCHERS = AI_NAMES.filter((name) => name !== 'Claude').map(matcher);
const CLAUDE_PREFIX = /^Claude(?=[^a-z0-9]|$)/i;
// Anthropic model families, so `Claude Opus 5` reads as a tool where a bare
// `Claude` reads as a person. Tracks the family names, not the versions.
const CLAUDE_TOOL_MATCHERS = ['Code', 'Fable', 'Haiku', 'Opus', 'Sonnet'].map(matcher);

// anchored, and `<` excluded from the class: unanchored `<([^>]*)>` retries at
// every `<` in a value that never closes, which is quadratic on commit text
const ADDRESS = /<([^<>]*)>[^<>]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/**
 * @param {string} text an address-slot value
 * @returns {string} the value without trailing backslashes
 */
function trimTrailingBackslashes(text) {
  let end = text.length;
  while (end > 0 && text[end - 1] === '\\') end -= 1;
  return text.slice(0, end);
}

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

  // a trailing backslash turns up where a URL was pasted into the address slot.
  // trimmed by hand — `/\\+$/` backtracks quadratically on a run of backslashes
  const address = found ? trimTrailingBackslashes(found[1].trim()) : '';
  const domain = EMAIL.test(address) ? address.split('@').pop().toLowerCase() : '';
  const name = found ? raw.slice(0, found.index).trim() : raw;

  return { raw, name, domain };
}

/**
 * Decide whether an identity belongs to a known non-AI bot.
 *
 * Automation — release-please, dependabot, this action's own committer — carries
 * no RAI footer of its own, so its commits score as unattributed churn if scored
 * at all. This is how a caller identifies them for exclusion instead.
 *
 * @param {string} value the identity, as `Name <email>`
 * @returns {boolean} true when the identity is on the bot denylist
 */
export function isKnownBotIdentity(value) {
  const { raw } = parseIdentity(value);
  return NON_AI_MATCHERS.some((m) => m.test(raw));
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

  // A name-only or malformed value can carry multiple tools in prose, so search
  // it whole. A valid address lets the domain disambiguate common human names.
  const subject = domain ? name : raw;
  const nameMatchers = domain ? ADDRESSED_AI_NAME_MATCHERS : AI_NAME_MATCHERS;
  if (nameMatchers.some((m) => m.test(subject))) return true;
  if (domain && CLAUDE_PREFIX.test(name) && CLAUDE_TOOL_MATCHERS.some((m) => m.test(name))) return true;

  // a parent domain counts, so `bot.example.com` resolves through `example.com`
  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    if (AI_EMAIL_DOMAINS.includes(labels.slice(i).join('.'))) return true;
  }

  return false;
}
