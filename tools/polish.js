// Final polish: convert ['name']() computed method keys into plain identifiers.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const prettier = require('prettier');

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function polish(code) {
	let ast;
	try {
		ast = parser.parse(code, { sourceType: 'module', allowAwaitOutsideFunction: true });
	} catch (e) {
		return { code, converted: 0 };
	}
	let converted = 0;
	traverse(ast, {
		'ObjectMethod|ClassMethod|ObjectProperty|ClassProperty'(p) {
			const n = p.node;
			if (!n.computed) return;
			if (!t.isStringLiteral(n.key)) return;
			if (!IDENT.test(n.key.value)) return;
			n.computed = false;
			n.key = t.identifier(n.key.value);
			converted++;
		},
	});
	try {
		return { code: generate(ast, { comments: true, jsescOption: { minimal: true } }).code, converted };
	} catch (e) {
		return { code, converted: 0 };
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
	let total = 0;
	for (const f of files) {
		const code = fs.readFileSync(f, 'utf8');
		if (!code.trim()) continue;
		const { code: out, converted } = polish(code);
		total += converted;
		let pretty = out;
		try {
			pretty = await prettier.format(out, { parser: 'babel', printWidth: 100, useTabs: true, singleQuote: true });
		} catch (e) {}
		fs.writeFileSync(f, pretty);
	}
	console.log('polished', files.length, 'files,', total, 'computed keys converted');
}
main();
