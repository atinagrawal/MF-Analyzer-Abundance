const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/POSTGRES_URL=["']?([^"'\r\n]+)/);
const connStr = match ? match[1] : process.env.POSTGRES_URL;

const { Client } = require('pg');
const client = new Client({ connectionString: connStr });

async function main() {
  await client.connect();
  const res = await client.query("SELECT DISTINCT category FROM mf_screener ORDER BY category");
  console.log("All distinct DB categories:");
  res.rows.forEach(r => console.log(`"${r.category}"`));
  await client.end();
}

main().catch(console.error);
