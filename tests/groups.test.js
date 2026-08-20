import { describe, expect, it } from 'vitest';
import { resolveWeight } from '../src/groups.js';

const AI = 'Claude Opus 5 <noreply@anthropic.com>';
const HUMAN = 'Jane Doe <jane@example.com>';
const FENCE = '```';

// GitHub's squash body, one `* ` bullet per collapsed commit
const squash = (...bodies) => bodies.map((body) => `* ${body}`).join('\n\n');

describe('resolveWeight', () => {
  it('returns null when nothing is attributed', () => {
    expect(resolveWeight('feat: add a thing\n\nNo footers here.')).toEqual({ weight: null, subCommits: 1 });
  });

  it('takes the max weight within a commit', () => {
    const message = ['feat: thing', '', `Assisted-by: ${AI}`, `Generated-by: ${AI}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.9, subCommits: 1 });
  });

  it('takes the max across paragraphs of one commit rather than the mean', () => {
    // a trailer block broken over two paragraphs is still one commit's attribution;
    // averaging it made a blank line worth 36% of the score
    const message = ['feat: thing', '', `Generated-by: ${AI}`, '', `Assisted-by: ${AI}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.9, subCommits: 1 });
  });

  it('takes the mean across squashed sub-commits', () => {
    const message = squash(`a\n\nGenerated-by: ${AI}`, `b\n\nAssisted-by: ${AI}`);
    expect(resolveWeight(message)).toEqual({ weight: (0.9 + 0.25) / 2, subCommits: 2 });
  });

  it('splits sub-commits on a CRLF message as it does on LF', () => {
    const message = ['* a', '', `Generated-by: ${AI}`, '', '* b', '', `Assisted-by: ${AI}`].join('\r\n');
    expect(resolveWeight(message)).toEqual({ weight: (0.9 + 0.25) / 2, subCommits: 2 });
  });

  it('leaves a footerless sub-commit out of the mean but counts it as a unit', () => {
    // the squash body says nothing about how much churn that sub-commit carried,
    // so averaging it in as a zero would charge the PR for a one-line follow-up
    const message = squash(`a\n\nGenerated-by: ${AI}`, 'b', 'c');
    expect(resolveWeight(message)).toEqual({ weight: 0.9, subCommits: 3 });
  });

  it('stays unattributed when no sub-commit carries a footer', () => {
    // a measured zero and nothing-to-measure are different claims
    expect(resolveWeight(squash('a', 'b', 'c'))).toEqual({ weight: null, subCommits: 3 });
  });

  it('ignores a trailer quoted inside a fenced block', () => {
    const message = ['docs: explain the format', '', FENCE, `Generated-by: ${AI}`, FENCE, '', `Authored-by: ${HUMAN}`];
    expect(resolveWeight(message.join('\n'))).toEqual({ weight: 0, subCommits: 1 });
  });

  it('ignores a bullet inside a fenced block', () => {
    const message = ['feat: thing', '', FENCE, '* not a sub-commit', FENCE, '', `Generated-by: ${AI}`];
    expect(resolveWeight(message.join('\n'))).toEqual({ weight: 0.9, subCommits: 1 });
  });

  it('keeps a trailer below an unterminated fence', () => {
    // swallowing to end-of-message dropped the whole trailer block and scored real
    // AI work as human — the failure this scorer exists to avoid
    const message = ['fix: paste a snippet', '', FENCE, 'foo.bar()', '', `Generated-by: ${AI}`];
    expect(resolveWeight(message.join('\n'))).toEqual({ weight: 0.9, subCommits: 1 });
  });

  it('still finds sub-commits below an unterminated fence', () => {
    const message = ['* a', '', FENCE, 'snippet', '', '* b', '', `Generated-by: ${AI}`];
    expect(resolveWeight(message.join('\n'))).toEqual({ weight: 0.9, subCommits: 2 });
  });

  it('closes a fence only on its own marker character', () => {
    const message = ['docs: thing', '', '~~~', `Generated-by: ${AI}`, FENCE, `Generated-by: ${AI}`, '~~~'];
    expect(resolveWeight(message.join('\n'))).toEqual({ weight: null, subCommits: 1 });
  });

  it('keeps attribution a hand-edited squash puts above the first bullet', () => {
    const message = ['feat: pr title (#9)', '', `Generated-by: ${AI}`, '', '* a', '', '* b'].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.9, subCommits: 3 });
  });

  it('does not count the squash subject as a sub-commit when it holds no footer', () => {
    const message = ['feat: pr title (#9)', '', '* a', '', `Generated-by: ${AI}`, '', '* b'].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.9, subCommits: 2 });
  });

  it('reads a tight Markdown list as prose, not as squash bullets', () => {
    // a commit listing its changes matched the bullet twice and read as a squash,
    // inventing a sub-commit in the summary
    const message = ['feat: thing', '', 'Changes:', '', '* first', '* second', '', `Generated-by: ${AI}`];
    expect(resolveWeight(message.join('\n'))).toEqual({ weight: 0.9, subCommits: 1 });
  });

  it('takes the max when a tight list carries attribution in two items', () => {
    const message = ['feat: thing', '', '* one', `Generated-by: ${AI}`, '* two', `Assisted-by: ${AI}`];
    expect(resolveWeight(message.join('\n'))).toEqual({ weight: 0.9, subCommits: 1 });
  });

  it('reads a single bullet as a plain commit, not a squash', () => {
    const message = ['* feat: only one', '', `Generated-by: ${AI}`, '', `Assisted-by: ${AI}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.9, subCommits: 1 });
  });

  it('discards a sub-commit whose only RAI line is a human Co-authored-by', () => {
    // GitHub appends one of these when squashing, and averaging it in as a zero
    // would tax every squash merged through the UI
    const message = squash(`a\n\nGenerated-by: ${AI}`, `b\n\nAssisted-by: ${AI}`, `c\n\nCo-authored-by: ${HUMAN}`);
    expect(resolveWeight(message)).toEqual({ weight: (0.9 + 0.25) / 2, subCommits: 3 });
  });

  it('counts a known-AI Co-authored-by at 0.50', () => {
    expect(resolveWeight(`feat: thing\n\nCo-authored-by: ${AI}`)).toEqual({ weight: 0.5, subCommits: 1 });
  });

  it('discards a human co-author whose name matches an ambiguous tool', () => {
    expect(resolveWeight('feat: thing\n\nCo-authored-by: Claude Martin <claude@example.com>')).toEqual({
      weight: null,
      subCommits: 1,
    });
  });

  it('counts an Authored-by-only commit at 0.00', () => {
    expect(resolveWeight(`feat: thing\n\nAuthored-by: ${HUMAN}`)).toEqual({ weight: 0, subCommits: 1 });
  });

  it('averages an Authored-by sub-commit against a Generated-by one', () => {
    expect(resolveWeight(squash(`a\n\nAuthored-by: ${HUMAN}`, `b\n\nGenerated-by: ${AI}`))).toEqual({
      weight: 0.45,
      subCommits: 2,
    });
  });

  it('keeps a human Co-authored-by from lowering a commit that has other footers', () => {
    const message = ['feat: thing', '', `Assisted-by: ${AI}`, `Co-authored-by: ${HUMAN}`].join('\n');
    expect(resolveWeight(message)).toEqual({ weight: 0.25, subCommits: 1 });
  });

  it('does not read Commit-generated-by as Generated-by', () => {
    expect(resolveWeight(`chore: thing\n\nCommit-generated-by: ${AI}`)).toEqual({ weight: 0.05, subCommits: 1 });
  });

  it('matches mixed-case footers', () => {
    expect(resolveWeight(`feat: thing\n\nCo-Authored-By: ${AI}`)).toEqual({ weight: 0.5, subCommits: 1 });
  });
});
