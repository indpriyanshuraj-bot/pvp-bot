import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'dist';
const BP = `${OUT}/BP`;
const withTests = process.argv.includes('--with-tests');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${BP}/scripts`, { recursive: true });
mkdirSync(`${OUT}/RP`, { recursive: true });

// Copy the whole pack skeleton so pack_icon.png and texts/ ship too.
cpSync('packs/BP', BP, { recursive: true });
cpSync('packs/RP', `${OUT}/RP`, { recursive: true });

// Engine modules are provided by Minecraft at runtime, never bundled.
const external = ['@minecraft/server', '@minecraft/server-ui', '@minecraft/server-gametest'];

const result = await build({
	entryPoints: ['src/main.ts'],
	outfile: `${BP}/scripts/main.js`,
	bundle: true,
	format: 'esm',
	target: 'es2022',
	platform: 'neutral',
	external,
	legalComments: 'none',
	metafile: true,
	logLevel: 'warning',
});

if (withTests) {
	mkdirSync(`${BP}/scripts/gametests`, { recursive: true });
	for (const f of readdirSync('gametests').filter((n) => n.endsWith('.mc.ts'))) {
		await build({
			entryPoints: [`gametests/${f}`],
			outfile: `${BP}/scripts/gametests/${f.replace(/\.mc\.ts$/, '.js')}`,
			bundle: true,
			format: 'esm',
			target: 'es2022',
			platform: 'neutral',
			external,
			logLevel: 'warning',
		});
	}
}

const bytes = Object.values(result.metafile?.outputs ?? {}).reduce((a, o) => a + o.bytes, 0);
writeFileSync(`${OUT}/build-info.json`, JSON.stringify({ bundleBytes: bytes, withTests }, null, 1));
console.log(`bundle: ${(bytes / 1024).toFixed(1)} KB${withTests ? ' (+ gametests)' : ''}`);

// Package a double-clickable .mcaddon (BP + RP side by side).
const pkg = JSON.parse(execFileSync('node', ['-p', "require('fs').readFileSync('package.json','utf8')"]).toString());
const mcaddon = `${OUT}/PvP_Bots_v${pkg.version}.mcaddon`;
try {
	rmSync(mcaddon, { force: true });
	execFileSync('zip', ['-qr', `PvP_Bots_v${pkg.version}.mcaddon`, 'BP', 'RP'], { cwd: OUT });
	console.log(`package: ${mcaddon}`);
} catch (e) {
	console.warn(`package: skipped (${e.message}) — zip unavailable?`);
}
