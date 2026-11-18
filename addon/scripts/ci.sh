#!/usr/bin/env bash
# Offline CI. Gametests are typechecked and built here but only execute inside
# Minecraft (/gametest run pvb:<name>).
set -uo pipefail
fail=0
step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
check() { if [ "$1" -ne 0 ]; then echo "  ✗ $2"; fail=1; else echo "  ✓ $2"; fi; }

step "1/7 typecheck (real @minecraft/server 2.11.0 types, strict, no dead code)"
npx tsc -p tsconfig.json; check $? "typescript"
# everything downstream depends on a clean typecheck
if [ $fail -ne 0 ]; then printf '\nCI FAILED (aborted: typecheck)\n'; exit 1; fi

step "2/7 purity — the testable core must not touch the engine"
bad=""
for f in $(find src/core src/learn src/social src/skills -name '*.ts' 2>/dev/null); do
  if grep -qE "from ['\"].*(@minecraft/|/engine/|^\.\./engine)" "$f"; then bad="$bad $f"; fi
done
if [ -n "$bad" ]; then echo "  ✗ engine dependency in pure layer:$bad"; fail=1; else echo "  ✓ pure layer is engine-free"; fi

step "3/7 unit tests"
node scripts/test.mjs > /tmp/unit.log 2>&1; rc=$?
grep -E "^# (tests|pass|fail)" /tmp/unit.log | sed 's/^/  /'
check $rc "unit suite"

step "4/7 bundle"
node scripts/build.mjs --with-tests; check $? "esbuild"
# gates 5-6 validate build artifacts, so a failed build must not be "verified"
if [ $fail -ne 0 ]; then printf '\nCI FAILED (aborted: build)\n'; exit 1; fi

step "5/7 bundle is valid, portable ESM"
node -e "
const fs=require('fs');
const js=fs.readFileSync('dist/BP/scripts/main.js','utf8');
const bad=[];
if(/\bnode:/.test(js)) bad.push('node: builtin');
if(/\brequire\s*\(/.test(js)) bad.push('require()');
if(/\bprocess\./.test(js)) bad.push('process');
if(/\b__dirname\b/.test(js)) bad.push('__dirname');
const imports=[...js.matchAll(/from\s*[\"']([^\"']+)[\"']/g)].map(m=>m[1]);
const allowed=new Set(['@minecraft/server','@minecraft/server-ui','@minecraft/server-gametest']);
const stray=imports.filter(i=>!allowed.has(i)&&!i.startsWith('.'));
if(stray.length) bad.push('unexpected import: '+stray.join(','));
if(imports.length===0) bad.push('no engine imports at all');
if(bad.length){console.error('  ✗ '+bad.join('; '));process.exit(1)}
console.log('  ✓ ESM clean, '+new Set(imports).size+' engine import(s), no Node builtins');
"; check $? "bundle portability"

step "6/7 pack validation"
node -e "
const fs=require('fs');
const errs=[];
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

for (const side of ['BP','RP']) {
  const base='dist/'+side;
  const mf=base+'/manifest.json';
  if(!fs.existsSync(mf)){errs.push(side+': manifest missing');continue}
  const m=JSON.parse(fs.readFileSync(mf,'utf8'));
  if(m.format_version!==2) errs.push(side+': format_version must be 2');
  if(!m.header?.uuid) errs.push(side+': header uuid missing');
  if(!Array.isArray(m.header?.min_engine_version)||m.header.min_engine_version.length!==3)
    errs.push(side+': min_engine_version must be [a,b,c]');
  if(!Array.isArray(m.header?.version)||m.header.version.length!==3)
    errs.push(side+': header version must be [a,b,c]');
  else if(m.header.version.join('.')!==pkg.version)
    errs.push(side+': manifest version '+m.header.version.join('.')+' != package '+pkg.version);
  if(!fs.existsSync(base+'/pack_icon.png')) errs.push(side+': pack_icon.png missing');
  if(!fs.existsSync(base+'/texts/en_US.lang')) errs.push(side+': texts/en_US.lang missing');
  if(!fs.existsSync(base+'/texts/languages.json')) errs.push(side+': texts/languages.json missing');
  if(typeof m.header?.name==='string' && !m.header.name.startsWith('pack.'))
    errs.push(side+': name should be the pack.name lang key');
}

const bp=JSON.parse(fs.readFileSync('dist/BP/manifest.json','utf8'));
const script=bp.modules?.find(x=>x.type==='script');
if(!script) errs.push('BP: no script module');
else if(!fs.existsSync('dist/BP/'+script.entry)) errs.push('BP: entry missing '+script.entry);

// Portable dependency versions: stable or the bare 'beta' alias only. A pinned
// preview like 1.0.0-beta.1.26.70-preview.26 locks the pack to one engine build.
for (const d of bp.dependencies??[]) {
  const v=String(d.version);
  if (v==='beta') continue;
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(v))
    errs.push('BP: dependency '+d.module_name+' version \''+v+'\' is not portable');
}
const deps=(bp.dependencies??[]).map(d=>d.module_name);
for(const need of ['@minecraft/server','@minecraft/server-gametest']) if(!deps.includes(need)) errs.push('BP: missing dep '+need);

if(errs.length){console.error('  ✗ '+errs.join('\n  ✗ '));process.exit(1)}
console.log('  ✓ manifests, icons, lang files, portable deps, version matches package');
"; check $? "pack"

step "7/7 gametest inventory"
n=$(ls dist/BP/scripts/gametests/*.js 2>/dev/null | wc -l)
echo "  ✓ $n in-game test file(s) — run with /gametest run pvb:<name>"

printf '\n'
if [ $fail -ne 0 ]; then echo "CI FAILED"; exit 1; fi
echo "CI PASSED"
