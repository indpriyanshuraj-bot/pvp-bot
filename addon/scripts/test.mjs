import { build } from 'esbuild';
import { readdirSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests').filter((f) => f.endsWith('.test.ts'));
if (files.length === 0) {
	console.error('no test files found');
	process.exit(1);
}

rmSync('dist-test', { recursive: true, force: true });
mkdirSync('dist-test', { recursive: true });

await Promise.all(
	files.map((f) =>
		build({
			entryPoints: [`tests/${f}`],
			outfile: `dist-test/${f.replace(/\.ts$/, '.mjs')}`,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			external: ['node:*'],
			logLevel: 'silent',
		}),
	),
);

const r = spawnSync(process.execPath, ['--test', 'dist-test/'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
