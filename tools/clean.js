// Second pass: strip leftover decoder machinery, normalise boolean/hex literals, tidy optional chaining.
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

	// 1. !![] -> true, ![] -> false, !0 -> true, !1 -> false
	traverse(ast, {
		UnaryExpression(p) {
			const { node } = p;
			if (node.operator !== '!') return;
			const a = node.argument;
			if (t.isArrayExpression(a) && a.elements.length === 0) {
				p.replaceWith(t.booleanLiteral(true));
			} else if (t.isUnaryExpression(a) && a.operator === '!' && t.isArrayExpression(a.argument) && a.argument.elements.length === 0) {
				p.replaceWith(t.booleanLiteral(false));
			} else if (t.isNumericLiteral(a)) {
				if (a.value === 0) p.replaceWith(t.booleanLiteral(true));
				else if (a.value === 1) p.replaceWith(t.booleanLiteral(false));
			}
		},
	});

	// 2. d?.['isValid'] -> d?.isValid
	traverse(ast, {
		OptionalMemberExpression(p) {
			const n = p.node;
			if (n.computed && t.isStringLiteral(n.property) && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n.property.value)) {
				n.computed = false;
				n.property = t.identifier(n.property.value);
			}
		},
		MemberExpression(p) {
			const n = p.node;
			if (n.computed && t.isStringLiteral(n.property) && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n.property.value)) {
				n.computed = false;
				n.property = t.identifier(n.property.value);
			}
		},
	});

	// 3. iteratively remove unused single-letter aliases (const s = b; const t = s; ...) in every scope
	for (let pass = 0; pass < 12; pass++) {
		let changed = false;
		traverse(ast, {
			VariableDeclarator(p) {
				const d = p.node;
				if (!t.isIdentifier(d.id)) return;
				if (!/^[A-Za-z_$]$/.test(d.id.name)) return;
				if (!t.isIdentifier(d.init)) return;
				const binding = p.scope.getBinding(d.id.name);
				if (binding && binding.referenced) return;
				if (p.parentPath.isVariableDeclaration() && p.parentPath.node.declarations.length > 1) {
					p.remove();
				} else if (p.parentPath.isVariableDeclaration()) {
					p.parentPath.remove();
				}
				changed = true;
			},
		});
		if (!changed) break;
	}

	// 4. drop now-unreferenced function declarations that contain the base64 decoder or the string array
	let removed = true;
	while (removed) {
		removed = false;
		traverse(ast, {
			Program(p) {
				for (const stmt of p.node.body) {
					if (!t.isFunctionDeclaration(stmt) || !stmt.id) continue;
					const binding = p.scope.getBinding(stmt.id.name);
					if (binding && binding.referenced) continue;
					const src = generate(stmt).code;
					const isMachinery = /decodeURIComponent|charCodeAt\(s\)\.toString\(16\)/.test(src) || /^function\s+\w+\(\)\s*\{[\s\S]*const \w+ = \[[\s\S]*?\];\s*\w+ = function/.test(src);
					if (isMachinery) {
						const idx = p.node.body.indexOf(stmt);
						p.node.body.splice(idx, 1);
						removed = true;
					}
				}
			},
		});
	}

	// 5. normalise numeric literal raw (hex -> decimal)
	traverse(ast, {
		NumericLiteral(p) {
			if (p.node.extra) delete p.node.extra.raw;
		},
	});

	try {
		return generate(ast, { comments: true, jsescOption: { minimal: true } }).code;
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
		try {
			out = await prettier.format(out, { parser: 'babel', printWidth: 100, useTabs: true, singleQuote: true });
		} catch (e) {}
		fs.writeFileSync(f, out);
	}
	console.log('cleaned', files.length, 'files');
}
main();
