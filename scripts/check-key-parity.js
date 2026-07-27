// Asserts this action's footer keys still match rai-lint's. A key added there
// and missed here silently scores those commits as unattributed.
import { AI_ATTRIBUTION_KEYS } from '../src/keys.js';

const SOURCE =
  'https://raw.githubusercontent.com/anchildress1/rai-lint/main/packages/python-gitlint/gitlint_rai/rules.py';

// a stalled fetch would otherwise hang until the job timeout with no diagnosis
const response = await fetch(SOURCE, { signal: AbortSignal.timeout(15_000) });
if (!response.ok) {
  console.error(`Could not fetch ${SOURCE}: HTTP ${response.status}`);
  process.exit(1);
}

const block = /AI_ATTRIBUTION_KEYS\s*=\s*\[([^\]]*)\]/.exec(await response.text());
if (!block) {
  console.error('Could not find AI_ATTRIBUTION_KEYS in rai-lint rules.py');
  process.exit(1);
}

const upstream = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const ours = AI_ATTRIBUTION_KEYS;

if (upstream.join(',') !== ours.join(',')) {
  console.error('Footer key sets have drifted.');
  console.error(`  rai-lint:         ${upstream.join(', ')}`);
  console.error(`  rai-commit-badge: ${ours.join(', ')}`);
  process.exit(1);
}

console.log(`Footer keys match rai-lint: ${ours.join(', ')}`);
