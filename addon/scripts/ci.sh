#!/usr/bin/env bash
# Full offline CI. The in-game gametests are typechecked here but only execute
# inside Minecraft (/gametest run pvb:<name>).
set -uo pipefail
fail=0
step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
check() { if [ "$1" -ne 0 ]; then echo "  ✗ $2"; fail=1; else echo "  ✓ $2"; fi; }

step "1/6 typecheck (against real @minecraft/server 2.11.0 types)"
npx tsc -p tsconfig.json; check $? "typescript"

step "2/6 purity — the testable core must not import the engine"
bad=$(grep -rl "@minecraft/" src/core src/learn src/social src/skills 2>/dev/null || true)
if [ -n "$bad" ]; then echo "  ✗ engine import in pure layer: $bad"; fail=1; else echo "  ✓ pure layer is engine-free"; fi

step "3/6 unit tests"
node scripts/test.mjs > /tmp/unit.log 2>&1; rc=$?
grep -E "^# (tests|pass|fail)" /tmp/unit.log | sed 's/^/  /'
check $rc "unit suite"

step "4/6 bundle"
node scripts/build.mjs --with-tests; check $? "esbuild"

step "5/6 pack validation"
node -e "
const fs=require('fs');
const m=JSON.parse(fs.readFileSync('dist/BP/manifest.json','utf8'));
const ok = m.header && m.header.uuid && m.modules.some(x=>x.type==='script');
if(!ok){console.error('  ✗ bad manifest');process.exit(1)}
const js=fs.readFileSync('dist/BP/scripts/main.js','utf8');
if(js.length<500){console.error('  ✗ bundle too small');process.exit(1)}
if(!js.includes('@minecraft/server')){console.error('  ✗ engine imports were bundled');process.exit(1)}
console.log('  ✓ manifest + bundle sane ('+(js.length/1024).toFixed(1)+' KB)');
"; check $? "pack"

step "6/6 gametest inventory"
n=$(ls dist/BP/scripts/gametests/*.js 2>/dev/null | wc -l)
echo "  ✓ $n in-game test file(s) built — run with /gametest run pvb:<name>"

printf '\n'
if [ $fail -ne 0 ]; then echo "CI FAILED"; exit 1; fi
echo "CI PASSED"
