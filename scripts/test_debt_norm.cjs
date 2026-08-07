const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/POSTGRES_URL=["']?([^"'\r\n]+)/);
const connStr = match ? match[1] : process.env.POSTGRES_URL;

const { Client } = require('pg');
const client = new Client({ connectionString: connStr });

function normalizeCategory(c = '') {
  if (!c || c === 'All') return 'All';
  return c
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^(equity|debt|hybrid|other|solution oriented|income\/debt oriented)\s*schemes?\s*-\s*/i, '')
    .replace(/\s*-\s*tax saver fund/i, '')
    .replace(/\s+fund$/i, '')
    .replace(/banking and psu debt/i, 'banking and psu')
    .replace(/ultra short term|ultra short to short term/i, 'ultra short duration')
    .replace(/short term/i, 'short duration')
    .replace(/medium term/i, 'medium duration')
    .replace(/balanced advantage fund\/\s*dynamic asset allocation/i, 'dynamic asset allocation or balanced advantage')
    .trim();
}

async function main() {
  await client.connect();
  const res = await client.query("SELECT code, name, category FROM mf_screener WHERE category ILIKE '%debt%' OR category ILIKE '%income%' OR category ILIKE '%liquid%' OR category ILIKE '%gilt%' OR category ILIKE '%overnight%'");
  const funds = res.rows;
  
  const rawCats = [...new Set(funds.map(f => f.category))];
  const normCats = [...new Set(funds.map(f => normalizeCategory(f.category)))];
  
  console.log(`Total Debt/Income funds: ${funds.length}`);
  console.log(`Raw Debt Categories (${rawCats.length}):`);
  rawCats.forEach(c => console.log(`  - "${c}" -> "${normalizeCategory(c)}"`));
  
  console.log(`\nNormalized Debt Categories (${normCats.length}):`);
  normCats.forEach(c => {
    const count = funds.filter(f => normalizeCategory(f.category) === c).length;
    console.log(`  - "${c}": ${count} funds`);
  });

  await client.end();
}

main().catch(console.error);
