const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

const idRegex = /id=['"]([^'"]+)['"]/g;
const ids = [];
let match;
while ((match = idRegex.exec(html)) !== null) {
  ids.push(match[1]);
}

const docRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
const missing = [];
while ((match = docRegex.exec(app)) !== null) {
  if (!ids.includes(match[1])) {
    missing.push(match[1]);
  }
}

console.log('Missing IDs:', missing);
