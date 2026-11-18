// Third pass: hard-remove the obfuscator machinery (decoder fn, string-array fn, aliases of them).
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const prettier = require('prettier');

function cleanOne(code) {
	let ast;
	try {
		ast = parser.parse(code, {
			sourceType: 'module',
			allowReturnOutsideFunction: true,
			allowAwaitOutsideFunction: true,
		});
	} catch (e) {
		return code;
	}

	// identify machinery by shape
	let decoderName = null;
	let arrayName = null;
	for (const stmt of ast.program.body) {
		if (!t.isFunctionDeclaration(stmt) || !stmt.id) continue;
		const src = generate(stmt).code;
		if (/decodeURIComponent/.test(src) && /charCodeAt\(/.test(src)) decoderName = stmt.id.name;
		if (/=\s*function\s*\(\)\s*\{\s*return\s+\w+\s*;?\s*\};?\s*return\s+\w+\(\)/.test(src.replace(/\s+/g, ' '))) arrayName = stmt.id.name;
	}
	const dead = new Set([decoderName, arrayName].filter(Boolean));
	if (dead.size === 0) return code;

	// collect aliases transitively
	for (let pass = 0; pass < 8; pass++) {
		traverse(ast, {
			VariableDeclarator(p) {
				const d = p.node;
				if (t.isIdentifier(d.id) && t.isIdentifier(d.init) && dead.has(d.init.name)) dead.add(d.id.name);
			},
			AssignmentExpression(p) {
				const n = p.node;
				if (t.isIdentifier(n.left) && t.isIdentifier(n.right) && dead.has(n.right.name)) dead.add(n.left.name);
			},
		});
	}

	// remove all declarators/assignments aliasing the machinery
	traverse(ast, {
		VariableDeclarator(p) {
			const d = p.node;
			if (t.isIdentifier(d.id) && dead.has(d.id.name) && t.isIdentifier(d.init) && dead.has(d.init.name)) {
				if (p.parentPath.isVariableDeclaration() && p.parentPath.node.declarations.length > 1) p.remove();
				else if (p.parentPath.isVariableDeclaration()) p.parentPath.remove();
			}
		},
	});
	ast.program.body = ast.program.body.filter((stmt) => {
		if (t.isFunctionDeclaration(stmt) && stmt.id && dead.has(stmt.id.name)) {
			const src = generate(stmt).code;
			return !/decodeURIComponent|return\s+\w+\s*\(\)/.test(src);
		}
		return true;
	});

	// tidy string escapes and numeric raws
	traverse(ast, {
		StringLiteral(p) {
			if (p.node.extra) delete p.node.extra.raw;
		},
		NumericLiteral(p) {
			if (p.node.extra) delete p.node.extra.raw;
		},
	});

	try {
		return generate(ast, { comments: true, jsescOption: { minimal: true, escapeEverything: false } }).code;
	} catch (e) {
		return code;
	}
}

async function main() {
	const dir = process.argv[2];
	const files = [];
	(function walk(d) {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith('.js')) files.push(p);
		}
	})(dir);
	for (const f of files) {
		const code = fs.readFileSync(f, 'utf8');
		if (!code.trim()) continue;
		let out = cleanOne(code);
		out = out.replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => {
			const c = parseInt(h, 16);
			return c >= 32 && c < 127 ? String.fromCharCode(c) : m;
		});
		try {
			out = await prettier.format(out, { parser: 'babel', printWidth: 100, useTabs: true, singleQuote: true });
		} catch (e) {}
		fs.writeFileSync(f, out);
	}
	console.log('stripped machinery in', files.length, 'files');
}
main();
