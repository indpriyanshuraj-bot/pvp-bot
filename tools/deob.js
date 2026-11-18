// Deobfuscator for javascript-obfuscator (obfuscator.io) output used by the PvP Practice Bots addon.
// Strategy: extract the string-array function + decoder function + rotation IIFE, run them in a vm,
// then replace every decoder(0xNN) call with its decoded string literal and constant-fold numbers.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const prettier = require('prettier');

function parse(code) {
	return parser.parse(code, {
		sourceType: 'module',
		allowReturnOutsideFunction: true,
		allowAwaitOutsideFunction: true,
		plugins: ['dynamicImport'],
	});
}

function sliceSrc(code, node) {
	return code.slice(node.start, node.end);
}

// Recursively evaluate a pure numeric/string expression, or return null.
function evalConst(node) {
	if (t.isNumericLiteral(node)) return node.value;
	if (t.isStringLiteral(node)) return node.value;
	if (t.isBooleanLiteral(node)) return node.value;
	if (t.isNullLiteral(node)) return null;
	if (t.isUnaryExpression(node)) {
		const v = evalConst(node.argument);
		if (v === null || typeof v !== 'number') return null;
		switch (node.operator) {
			case '-': return -v;
			case '+': return +v;
			case '~': return ~v;
			case '!': return !v;
			case 'void': return undefined;
			default: return null;
		}
	}
	if (t.isBinaryExpression(node)) {
		const a = evalConst(node.left), b = evalConst(node.right);
		if (a === null || b === null) return null;
		if (typeof a !== 'number' || typeof b !== 'number') {
			if (node.operator === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
			return null;
		}
		switch (node.operator) {
			case '+': return a + b;
			case '-': return a - b;
			case '*': return a * b;
			case '/': return a / b;
			case '%': return a % b;
			case '|': return a | b;
			case '&': return a & b;
			case '^': return a ^ b;
			case '<<': return a << b;
			case '>>': return a >> b;
			case '>>>': return a >>> b;
			case '**': return a ** b;
			default: return null;
		}
	}
	if (t.isParenthesizedExpression(node)) return evalConst(node.expression);
	return null;
}

function deobfuscateOne(code) {
	const ast = parse(code);

	// --- locate machinery ---
	let arrayFn = null, decoderFn = null, rotationStmt = null;
	for (const stmt of ast.program.body) {
		if (t.isFunctionDeclaration(stmt) && stmt.id) {
			const src = sliceSrc(code, stmt);
			if (!decoderFn && /decodeURIComponent/.test(src)) decoderFn = stmt;
			else if (!arrayFn && t.isArrayExpression(stmt.body.body.find(x => t.isVariableDeclaration(x))?.declarations?.[0]?.init) === false) {
				// handled below
			}
			// array function: zero params and contains a string array literal
			if (!arrayFn && stmt.params.length === 0 && /=\s*\[/.test(src)) arrayFn = stmt;
		}
		if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression) && t.isFunctionExpression(stmt.expression.callee) && stmt.expression.arguments.length === 2) {
			rotationStmt = stmt;
		}
	}

	// prefer the function named by the rotation IIFE's first argument (authoritative)
	if (rotationStmt && t.isIdentifier(rotationStmt.expression.arguments[0])) {
		const want = rotationStmt.expression.arguments[0].name;
		const found = ast.program.body.find((s2) => t.isFunctionDeclaration(s2) && s2.id && s2.id.name === want);
		if (found) arrayFn = found;
	}
	if (!arrayFn || !decoderFn) return { ok: false, reason: 'machinery not found', code };

	const decoderName = decoderFn.id.name;
	const pieces = [sliceSrc(code, arrayFn), sliceSrc(code, decoderFn)];
	if (rotationStmt) pieces.push(sliceSrc(code, rotationStmt));

	const script = pieces.join('\n') + `\n;__DECODER__=${decoderName};`;
	let decoder;
	try {
		const ctx = { console, decodeURIComponent, String, parseInt, Number };
		vm.createContext(ctx);
		vm.runInContext(script, ctx, { timeout: 5000 });
		decoder = ctx.__DECODER__;
	} catch (e) {
		return { ok: false, reason: 'vm eval failed: ' + e.message, code };
	}
	if (typeof decoder !== 'function') return { ok: false, reason: 'decoder not a function', code };

	// --- collect aliases of the decoder (const X = b; const Y = X; ...) ---
	const aliases = new Set([decoderName]);
	for (let pass = 0; pass < 6; pass++) {
		traverse(ast, {
			VariableDeclarator(p) {
				const { id, init } = p.node;
				if (t.isIdentifier(id) && t.isIdentifier(init) && aliases.has(init.name)) aliases.add(id.name);
			},
		});
	}

	// --- replace decoder calls (through aliases) ---
	let replaced = 0, failed = 0;
	traverse(ast, {
		CallExpression(p) {
			const { node } = p;
			if (!t.isIdentifier(node.callee) || !aliases.has(node.callee.name)) return;
			if (node.arguments.length < 1) return;
			let arg = node.arguments[0];
			if (t.isBinaryExpression(arg) || t.isUnaryExpression(arg)) {
				const v = evalConst(arg);
				if (typeof v === 'number') arg = t.numericLiteral(v);
			}
			if (!t.isNumericLiteral(arg)) return;
			try {
				const s = decoder(arg.value);
				if (typeof s === 'string') {
					p.replaceWith(t.stringLiteral(s));
					replaced++;
				} else failed++;
			} catch (e) { failed++; }
		},
	});

	// --- drop alias vars like `const s = b;` that are now unused ---
	traverse(ast, {
		VariableDeclarator(p) {
			if (t.isIdentifier(p.node.init) && aliases.has(p.node.init.name) && t.isIdentifier(p.node.id)) {
				const name = p.node.id.name;
				const binding = p.scope.getBinding(name);
				if (binding && !binding.referenced) p.remove();
			}
		},
	});

	// --- drop the string-array rotation IIFE (dead after decoding) ---
	ast.program.body = ast.program.body.filter((stmt) => {
		if (!t.isExpressionStatement(stmt)) return true;
		const e = stmt.expression;
		if (!t.isCallExpression(e) || !t.isFunctionExpression(e.callee) || e.arguments.length !== 2) return true;
		return !(t.isIdentifier(e.arguments[0]) && e.arguments[0].name === arrayFn.id.name);
	});

	// --- constant-fold numeric/string binary expressions ---
	let folded = 0;
	traverse(ast, {
		'BinaryExpression|UnaryExpression': {
			exit(p) {
				const v = evalConst(p.node);
				if (v === null || v === undefined) return;
				if (typeof v === 'number' && Number.isFinite(v)) { p.replaceWith(t.numericLiteral(v)); folded++; }
				else if (typeof v === 'string') { p.replaceWith(t.stringLiteral(v)); folded++; }
			},
		},
	});

	// --- member expressions with string keys -> dot notation ---
	traverse(ast, {
		MemberExpression(p) {
			const { node } = p;
			if (!node.computed || !t.isStringLiteral(node.property)) return;
			const k = node.property.value;
			if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)) {
				node.computed = false;
				node.property = t.identifier(k);
			}
		},
	});

	// --- remove the decoder and array function declarations if nothing references them ---
	for (const name of [decoderName, arrayFn.id.name]) {
		const binding = ast.program.scope?.getBinding?.(name);
	}
	ast.program.body = ast.program.body.filter((stmt) => {
		if (!t.isFunctionDeclaration(stmt) || !stmt.id) return true;
		if (stmt.id.name !== decoderName && stmt.id.name !== arrayFn.id.name) return true;
		const src = generate(stmt).code;
		// keep only if still referenced elsewhere in the file
		const others = ast.program.body.filter((s2) => s2 !== stmt).map((s2) => generate(s2).code).join('\n');
		return new RegExp('\\b' + stmt.id.name + '\\b').test(others);
	});

	let out;
	try { out = generate(ast, { comments: true, jsescOption: { minimal: true } }).code; }
	catch (e) { return { ok: false, reason: 'generate failed: ' + e.message, code }; }

	return { ok: true, code: out, replaced, failed, folded };
}

async function main() {
	const srcDir = process.argv[2];
	const outDir = process.argv[3];
	const report = [];
	const files = [];
	(function walk(d) {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith('.js')) files.push(p);
		}
	})(srcDir);

	for (const f of files) {
		const rel = path.relative(srcDir, f);
		const code = fs.readFileSync(f, 'utf8');
		if (!code.trim()) { report.push({ rel, status: 'empty' }); continue; }
		const r = deobfuscateOne(code);
		const dst = path.join(outDir, rel);
		fs.mkdirSync(path.dirname(dst), { recursive: true });
		if (!r.ok) {
			fs.writeFileSync(dst, code);
			report.push({ rel, status: 'FAILED', reason: r.reason });
			continue;
		}
		let pretty = r.code;
		try {
			pretty = await prettier.format(r.code, { parser: 'babel', printWidth: 100, useTabs: true, semi: true, singleQuote: true });
		} catch (e) { /* keep unformatted */ }
		fs.writeFileSync(dst, pretty);
		report.push({ rel, status: 'ok', replaced: r.replaced, failed: r.failed, folded: r.folded, bytes: pretty.length });
	}
	console.log(JSON.stringify(report, null, 1));
}

main();
