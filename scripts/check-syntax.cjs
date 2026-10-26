const fs = require('node:fs');
const cp = require('node:child_process');
for (const file of fs.readdirSync('.').filter(name => name.endsWith('.js'))) {
  cp.execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log('JavaScript syntax checks passed');
