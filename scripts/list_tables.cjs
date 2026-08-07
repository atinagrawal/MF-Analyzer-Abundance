const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/POSTGRES_URL=["']?([^"'\r\n]+)/);
const connStr = match ? match[1] : process.env.POSTGRES_URL;

const { Client } = require('pg');
const client = new Client({ connectionString: connStr });

async function main() {
  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log("Tables:", res.rows.map(r => r.table_name).join(', '));
  await client.end();
}
main().catch(console.error);
