const fs = require('fs');
const path = require('path');
const db = require('./db');

async function initDB() {
    console.log('🔄 Inicializando tablas en la base de datos...');
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf-8');
        const statements = sql.split(';').filter(stmt => stmt.trim() !== '');
        
        for (const stmt of statements) {
            await db.query(stmt);
        }
        console.log('✅ Tablas creadas/verificadas correctamente.');
    } catch (error) {
        console.error('❌ Error inicializando la base de datos:', error);
    } finally {
        process.exit();
    }
}

initDB();
