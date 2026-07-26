import { describe, expect, it } from 'vitest';
import { isKnownAiIdentity } from '../src/ai-identities.js';

describe('isKnownAiIdentity', () => {
  it.each([
    'Claude Opus 5 <noreply@anthropic.com>',
    'Claude Sonnet 4.6 <noreply@anthropic.com>',
    'Copilot Autofix powered by AI <62310815+github-advanced-security[bot]@users.noreply.github.com>',
    'Copilot <198982749+Copilot@users.noreply.github.com>',
    'copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>',
    'GitHub Copilot <copilot@github.com>',
    'Verdant <noreply@verdent.ai>',
    'ChatGPT <chatgpt@openai.com>',
    'GPT-5 <bot@example.com>',
    'Cursor Agent <agent@cursor.com>',
    'Some Bot <bot@eng.anthropic.com>',
  ])('matches %s', (value) => {
    expect(isKnownAiIdentity(value)).toBe(true);
  });

  it.each([
    'Ashley Childress <6563688+anchildress1@users.noreply.github.com>',
    'anchildress1 <6563688+anchildress1@users.noreply.github.com>',
    'dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>',
    'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>',
    'renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>',
    'Jane Doe <jane@example.com>',
    'Claudette Fontaine <claudette@example.com>',
  ])('rejects %s', (value) => {
    expect(isKnownAiIdentity(value)).toBe(false);
  });

  it('rejects a value with no email at all', () => {
    expect(isKnownAiIdentity('Jane Doe')).toBe(false);
  });

  it('rejects a lookalike parent domain', () => {
    expect(isKnownAiIdentity('Impostor <a@notanthropic.com>')).toBe(false);
  });
});
