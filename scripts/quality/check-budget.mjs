import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const baselinePath = resolve('docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.json');

const readBaseline = () => {
  const content = readFileSync(baselinePath, 'utf8');
  return JSON.parse(content);
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    const details = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${details}`);
  }

  return (result.stdout ?? '').trim();
};

const countRipgrepMatches = (pattern) => {
  const result = spawnSync('rg', [
    '-n',
    '--glob',
    '*.ts',
    '--glob',
    '*.tsx',
    '--glob',
    '!**/*.test.ts',
    '--glob',
    '!**/*.test.tsx',
    pattern,
    'src',
  ], {
    encoding: 'utf8',
  });

  if (result.status === 1) {
    return 0;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    const details = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(`Command failed: rg -n ... ${pattern} src\n${details}`);
  }

  const output = (result.stdout ?? '').trim();

  if (!output) {
    return 0;
  }

  return output.split('\n').filter(Boolean).length;
};

const baseline = readBaseline();

const strictReportRaw = run('pnpm', ['--silent', 'quality:strict-report']);
const strictReport = JSON.parse(strictReportRaw);

const productionAnyCount = countRipgrepMatches('\\bany\\b');
const productionAsAnyCount = countRipgrepMatches('as any');

const checks = [
  {
    name: 'strictErrorsTotal',
    current: strictReport.total,
    baseline: baseline.strictErrorsTotal,
  },
  {
    name: 'productionAnyCount',
    current: productionAnyCount,
    baseline: baseline.productionAnyCount,
  },
  {
    name: 'productionAsAnyCount',
    current: productionAsAnyCount,
    baseline: baseline.productionAsAnyCount,
  },
];

const failures = checks.filter((check) => check.current > check.baseline);

if (failures.length > 0) {
  console.error('Quality budget failed:');
  for (const failure of failures) {
    console.error(
      `- ${failure.name}: current=${failure.current} baseline=${failure.baseline}`,
    );
  }
  process.exit(1);
}

console.log('Quality budget passed.');
for (const check of checks) {
  console.log(`- ${check.name}: current=${check.current} baseline=${check.baseline}`);
}
