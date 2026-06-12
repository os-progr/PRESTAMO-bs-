const fs = require('fs');

let code = fs.readFileSync('app.js', 'utf8');

// remove document.addEventListener block wrapper
code = code.replace(/document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{/, '');
// remove the last });
code = code.replace(/\}\);\s*$/, '');

const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

global.fetch = async (url, options) => {
    return require('node-fetch')(url, options);
};

global.config = { moraAdicional: 5 };
global.formatCurrency = (n) => n;

let outputHtml = '';
global.document = {
    addEventListener: () => {},
    getElementById: (id) => {
        if (id === 'table-resumen-body') {
            return {
                set innerHTML(val) {
                    outputHtml = val;
                }
            };
        }
        return {};
    }
};

try {
    eval(code);
    
    fetchClients().then(() => {
        renderResumenTable();
        const rows = outputHtml.match(/<tr>/g);
        console.log('Rows rendered in HTML:', rows ? rows.length : 0);
    }).catch(e => console.error('Error fetching', e));

} catch(e) {
    console.error(e);
}
