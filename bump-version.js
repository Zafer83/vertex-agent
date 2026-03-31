const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const version = packageJson.version.split('.');
const major = parseInt(version[0]);
const minor = parseInt(version[1]);
const patch = parseInt(version[2]);

const newVersion = `${major}.${minor}.${patch + 1}`;
packageJson.version = newVersion;

fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

console.log(`Version bumped: ${version.join('.')} → ${newVersion}`);
