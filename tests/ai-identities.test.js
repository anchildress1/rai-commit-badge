import { describe, expect, it } from 'vitest';
import { isKnownAiIdentity, isKnownBotIdentity, parseIdentity } from '../src/ai-identities.js';

describe('parseIdentity', () => {
  it('splits an addressed identity', () => {
    expect(parseIdentity('Claude Opus 5 <noreply@anthropic.com>')).toEqual({
      raw: 'Claude Opus 5 <noreply@anthropic.com>',
      name: 'Claude Opus 5',
      domain: 'anthropic.com',
    });
  });

  it('keeps a name-only identity whole', () => {
    expect(parseIdentity('Claude Opus 4.8')).toEqual({
      raw: 'Claude Opus 4.8',
      name: 'Claude Opus 4.8',
      domain: '',
    });
  });

  it('finds the address when the value carries trailing text', () => {
    expect(parseIdentity('Nameless <noreply@anthropic.com> (v2)').domain).toBe('anthropic.com');
  });

  it('lowercases the domain', () => {
    expect(parseIdentity('Bot <BOT@Anthropic.COM>').domain).toBe('anthropic.com');
  });

  it('strips trailing backslashes from a URL pasted into the address slot', () => {
    // the hand-rolled trim exists because /\\+$/ backtracks quadratically here
    expect(parseIdentity('Tool <https://example.com\\\\\\\\>').domain).toBe('');
    expect(parseIdentity('Claude <noreply@anthropic.com\\\\>').domain).toBe('anthropic.com');
  });

  it('yields no domain for an address with no @', () => {
    expect(parseIdentity('Bot <not-an-email>').domain).toBe('');
  });
});

describe('isKnownAiIdentity', () => {
  it.each([
    'Claude Opus 5 <noreply@anthropic.com>',
    'Claude Opus 4.8',
    'Claude',
    'Claude Code <noreply@github.com>',
    'Claude Opus 5 <bot@example.com>',
    'Claude 3.5 Sonnet <bot@example.com>',
    'Some Bot <bot@eng.anthropic.com>',
    'Nameless <noreply@anthropic.com>',
  ])('matches %s', (value) => {
    expect(isKnownAiIdentity(value)).toBe(true);
  });

  it.each([
    'Ashley Childress <6563688+anchildress1@users.noreply.github.com>',
    'dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>',
    'Claude <claude@example.com>',
    'Claude Martin <claude@example.com>',
    'Jane Doe <jane@example.com>',
    'Jane Doe',
    'Claudette Fontaine <claudette@example.com>',
    'Impostor <a@notanthropic.com>',
  ])('rejects %s', (value) => {
    expect(isKnownAiIdentity(value)).toBe(false);
  });

  it('matches an unambiguous tool name on a shared email domain', () => {
    expect(isKnownAiIdentity('Copilot <jane@example.com>')).toBe(true);
  });

  // Junie, Kiro, and Ona are human given names as well as tools, so an address has
  // to name the vendor before the name counts
  it.each(['Junie', 'Kiro', 'Ona', 'Kiro <hello@kiro.dev>', 'Ona <bot@ona.com>'])(
    'matches the ambiguous name %s',
    (value) => {
      expect(isKnownAiIdentity(value)).toBe(true);
    }
  );

  it.each([
    'Junie Fischer <junie@example.com>',
    'Kiro Tanaka <kiro@example.com>',
    'Ona Petrauskaite <ona.p@gmail.com>',
  ])('reads the ambiguous name %s on a non-vendor address as a person', (value) => {
    expect(isKnownAiIdentity(value)).toBe(false);
  });

  // every other rejected value falls through for want of any AI signal, so none of
  // them notices if the denylist stops short-circuiting. These carry both signals.
  it.each([
    'github-actions[bot] <noreply@anthropic.com>',
    'Copilot <github-actions[bot]@users.noreply.github.com>',
    'renovate[bot] <bot@cursor.com>',
  ])('lets the non-AI denylist beat an AI signal in %s', (value) => {
    expect(isKnownAiIdentity(value)).toBe(false);
  });

  it('does not read tool names from the address', () => {
    expect(isKnownAiIdentity('Jane Doe <jane@claude.example.com>')).toBe(false);
  });
});

describe('isKnownBotIdentity', () => {
  it.each([
    'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>',
    'dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>',
    'release-please[bot] <example@example.com>',
  ])('matches %s', (value) => {
    expect(isKnownBotIdentity(value)).toBe(true);
  });

  it.each(['Jane Doe <jane@example.com>', 'Claude Opus 5 <noreply@anthropic.com>', 'Ashley Childress <a@example.com>'])(
    'rejects %s',
    (value) => {
      expect(isKnownBotIdentity(value)).toBe(false);
    }
  );
});
