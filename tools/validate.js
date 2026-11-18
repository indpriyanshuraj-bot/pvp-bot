// Validate: syntax of every file, and that every local import resolves to a real export.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

const ROOT = process.argv[2];

function listFiles(dir) {
	const out = [];
	(function walk(d) {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith('.js')) out.push(p);
		}
	})(dir);
	return out;
}

const files = listFiles(ROOT);
const asts = new Map();
const syntaxErrors = [];

for (const f of files) {
	const code = fs.readFileSync(f, 'utf8');
	try {
		asts.set(f, parser.parse(code, { sourceType: 'module', allowAwaitOutsideFunction: true }));
	} catch (e) {
		syntaxErrors.push({ file: path.relative(ROOT, f), error: e.message });
	}
}

// collect exports per file
const exportsMap = new Map(); // absPath -> {names:Set, hasDefault:bool}
for (const [f, ast] of asts) {
	const names = new Set();
	let hasDefault = false;
	for (const stmt of ast.program.body) {
		if (t.isExportNamedDeclaration(stmt)) {
			if (stmt.declaration) {
				const d = stmt.declaration;
				if (t.isFunctionDeclaration(d) || t.isClassDeclaration(d)) names.add(d.id.name);
				else if (t.isVariableDeclaration(d)) d.declarations.forEach((v) => t.isIdentifier(v.id) && names.add(v.id.name));
			}
			if (stmt.specifiers) stmt.specifiers.forEach((s) => names.add(s.exported.name || s.exported.value));
		} else if (t.isExportDefaultDeclaration(stmt)) hasDefault = true;
	}
	exportsMap.set(f, { names, hasDefault });
}

function resolveLocal(fromFile, spec) {
	if (!spec.startsWith('.')) return null;
	let p = path.resolve(path.dirname(fromFile), spec);
	const cands = [p, p + '.js', path.join(p, 'index.js')];
	for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
	return 'MISSING:' + p;
}

const unresolved = [];
const missingExports = [];
const bareSpecifiers = new Set();

for (const [f, ast] of asts) {
	for (const stmt of ast.program.body) {
		if (!t.isImportDeclaration(stmt)) continue;
		const spec = stmt.source.value;
		if (!spec.startsWith('.')) {
			bareSpecifiers.add(spec);
			continue;
		}
		const target = resolveLocal(f, spec);
		if (!target || target.startsWith('MISSING:')) {
			unresolved.push({ file: path.relative(ROOT, f), spec });
			continue;
		}
		const exp = exportsMap.get(target);
		if (!exp) continue;
		for (const s of stmt.specifiers) {
			if (t.isImportDefaultSpecifier(s)) {
				if (!exp.hasDefault && !exp.names.has('default')) {
					// default import from a module with no default export
					missingExports.push({ file: path.relative(ROOT, f), spec, name: 'default', target: path.relative(ROOT, target) });
				}
			} else if (t.isImportSpecifier(s)) {
				const name = s.imported.name || s.imported.value;
				if (!exp.names.has(name)) {
					missingExports.push({ file: path.relative(ROOT, f), spec, name, target: path.relative(ROOT, target) });
				}
			}
		}
	}
}

console.log(JSON.stringify({
	fileCount: files.length,
	syntaxErrors,
	unresolved,
	missingExports,
	bareSpecifiers: [...bareSpecifiers],
}, null, 1));
