const fs = require('fs');
let code = fs.readFileSync('src/components/quotes/QuotesData.ts', 'utf8');

// Match 'actividades: [' and its closing '],'
let newCode = code.replace(/(\bactividades:\s*\[[\s\S]*?^\s*\],)/gm, "$1\n    chat: [],");

fs.writeFileSync('src/components/quotes/QuotesData.ts', newCode);
