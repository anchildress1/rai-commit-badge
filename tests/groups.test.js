import { describe, expect, it } from 'vitest';
import { resolveWeight } from '../src/groups.js';

const AI = 'Claude Opus 5 <noreply@anthropic.com>';
const HUMAN = 'Jane Doe <jane@example.com>';

describe('resolveWeight', () => {
  it('returns null when nothing is attributed', () => {
    expect(resolveWeight('feat: add a thing\n\nNo footers here.')).toEqual({ weight: null, groups: 0 });
  });

  it('takes the max weight within a group', () => {
    const message = ['feat: thing', '', `Assisted-by: ${AI}`, `Generated-by: ${AI}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.9, groups: 1 });
  });

  it('takes the mean across groups', () => {
    const message = ['feat: thing', '', `Generated-by: ${AI}`, '', `Assisted-by: ${AI}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: (0.9 + 0.25) / 2, groups: 2 });
  });

  it('discards a group whose only RAI line is a human Co-authored-by', () => {
    const message = [
      'feat: squashed',
      '',
      `Generated-by: ${AI}`,
      '',
      `Assisted-by: ${AI}`,
      '',
      `Co-authored-by: ${HUMAN}`,
    ].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: (0.9 + 0.25) / 2, groups: 2 });
  });

  it('counts a known-AI Co-authored-by at 0.50', () => {
    expect(resolveWeight(`feat: thing\n\nCo-authored-by: ${AI}`)).toEqual({ weight: 0.5, groups: 1 });
  });

  it('discards a human co-author whose name matches an ambiguous tool', () => {
    expect(resolveWeight('feat: thing\n\nCo-authored-by: Claude Martin <claude@example.com>')).toEqual({
      weight: null,
      groups: 0,
    });
  });

  it('counts an Authored-by-only group at 0.00', () => {
    expect(resolveWeight(`feat: thing\n\nAuthored-by: ${HUMAN}`)).toEqual({ weight: 0, groups: 1 });
  });

  it('averages an Authored-by group against a Generated-by group', () => {
    const message = ['feat: squashed', '', `Authored-by: ${HUMAN}`, '', `Generated-by: ${AI}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.45, groups: 2 });
  });

  it('keeps a human Co-authored-by from lowering a group that has other footers', () => {
    const message = ['feat: thing', '', `Assisted-by: ${AI}`, `Co-authored-by: ${HUMAN}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.25, groups: 1 });
  });

  it('does not read Commit-generated-by as Generated-by', () => {
    expect(resolveWeight(`chore: thing\n\nCommit-generated-by: ${AI}`)).toEqual({ weight: 0.05, groups: 1 });
  });

  it('treats a whitespace-only line as a paragraph break', () => {
    const message = ['feat: thing', '', `Generated-by: ${AI}`, '   ', `Authored-by: ${HUMAN}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.45, groups: 2 });
  });

  it('matches mixed-case footers', () => {
    expect(resolveWeight(`feat: thing\n\nCo-Authored-By: ${AI}`)).toEqual({ weight: 0.5, groups: 1 });
  });
});
