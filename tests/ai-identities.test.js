import { describe, expect, it } from 'vitest';
import { isKnownAiIdentity, parseIdentity } from '../src/ai-identities.js';

describe('parseIdentity', () => {
  it('splits an addressed identity', () => {
    expect(parseIdentity('Claude Opus 5 <noreply@anthropic.com>')).toEqual({
      name: 'Claude Opus 5',
      domain: 'anthropic.com',
    });
  });

  it('keeps a name-only identity whole', () => {
    expect(parseIdentity('Claude Opus 4.8')).toEqual({ name: 'Claude Opus 4.8', domain: '' });
  });

  it('lowercases the domain', () => {
    expect(parseIdentity('Bot <BOT@Anthropic.COM>').domain).toBe('anthropic.com');
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
    'Some Bot <bot@eng.anthropic.com>',
    'Nameless <noreply@anthropic.com>',
  ])('matches %s', (value) => {
    expect(isKnownAiIdentity(value)).toBe(true);
  });

  it.each([
    'Ashley Childress <6563688+anchildress1@users.noreply.github.com>',
    'dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>',
    'Jane Doe <jane@example.com>',
    'Jane Doe',
    'Claudette Fontaine <claudette@example.com>',
    'Impostor <a@notanthropic.com>',
  ])('rejects %s', (value) => {
    expect(isKnownAiIdentity(value)).toBe(false);
  });

  it('reads the display name, not the address, when the two disagree', () => {
    expect(isKnownAiIdentity('Claude <jane@example.com>')).toBe(true);
    expect(isKnownAiIdentity('Jane Doe <jane@claude.example.com>')).toBe(false);
  });
});
