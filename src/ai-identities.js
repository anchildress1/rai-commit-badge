// Domains an AI vendor sends commit mail from. Matched on the email's domain or
// any parent of it, so `bot.anthropic.com` resolves through `anthropic.com`.
export const AI_EMAIL_DOMAINS = new Set([
  'aider.chat',
  'ampcode.com',
  'anthropic.com',
  'codeium.com',
  'codium.ai',
  'cognition.ai',
  'cursor.com',
  'cursor.sh',
  'deepmind.com',
  'openai.com',
  'qodo.ai',
  'sourcegraph.com',
  'sourcery.ai',
  'tabnine.com',
  'verdent.ai',
  'windsurf.com',
]);

// Tool names, matched word-bounded against the whole footer value. Carries the
// bot identities GitHub routes through users.noreply.github.com, where the
// domain says nothing — `Copilot Autofix powered by AI` and `dependabot[bot]`
// share a domain and only the name separates them.
export const AI_NAME_PATTERN =
  /\b(?:aider|amp|chatgpt|claude|codeium|codex|copilot|cursor|devin|gemini|gpt-?\d|jules|qodo|sourcery|tabnine|verdent|windsurf)\b/i;

/**
 * Decide whether a `Co-authored-by` value names a known AI tool.
 *
 * @param {string} value the footer value, e.g. `Claude Opus 5 <noreply@anthropic.com>`
 * @returns {boolean} true when the identity is a known AI tool
 */
export function isKnownAiIdentity(value) {
  const email = /<([^>]+)>/.exec(value)?.[1] ?? '';
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  if (domain) {
    const labels = domain.split('.');
    for (let i = 0; i < labels.length - 1; i += 1) {
      if (AI_EMAIL_DOMAINS.has(labels.slice(i).join('.'))) return true;
    }
  }
  return AI_NAME_PATTERN.test(value);
}
