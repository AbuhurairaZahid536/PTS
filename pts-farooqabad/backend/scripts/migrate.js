const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config/env');

async function main() {
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
  });

  const migrationDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Applying ${file}...`);
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    await pool.query(sql);
    console.log(`Applied ${file}`);
  }

  await pool.end();
  console.log('Database migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
