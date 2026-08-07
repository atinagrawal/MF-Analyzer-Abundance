const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/POSTGRES_URL=["']?([^"'\r\n]+)/);
const connStr = match ? match[1] : process.env.POSTGRES_URL;

const { Client } = require('pg');
const client = new Client({ connectionString: connStr });

async function main() {
  await client.connect();
  const res = await client.query("SELECT code, name, amc, category, structure, flag FROM mf_screener WHERE name ILIKE '%Invesco%' ORDER BY name");
  console.log(`Found ${res.rows.length} Invesco funds:`);
  res.rows.forEach(r => console.log(`- ${r.code} | ${r.name} | CAT: "${r.category}" | STR: "${r.structure}"`));
  await client.end();
}

main().catch(console.error);
