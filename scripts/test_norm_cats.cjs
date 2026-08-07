const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/POSTGRES_URL=["']?([^"'\r\n]+)/);
const connStr = match ? match[1] : process.env.POSTGRES_URL;

const { Client } = require('pg');
const client = new Client({ connectionString: connStr });

function normCat(c = '') {
  if (!c || c === 'All') return 'All';
  return c
    .toLowerCase()
    .replace(/schemes/g, 'scheme')
    .replace(/\s*-\s*tax saver fund/i, '')
    .replace(/\s+fund$/i, '')
    .replace(/balanced advantage fund\/\s*dynamic asset allocation/i, 'dynamic asset allocation or balanced advantage')
    .trim();
}

async function main() {
  await client.connect();
  const res = await client.query("SELECT name, category FROM mf_screener");
  const funds = res.rows;
  
  const categories = [...new Set(funds.map(f => f.category))];
  console.log(`Total funds: ${funds.length}, Total raw categories: ${categories.length}`);
  
  const largeMidStrict = funds.filter(f => f.category === 'Equity Scheme - Large & Mid Cap Fund').length;
  const largeMidNorm = funds.filter(f => normCat(f.category).includes('large & mid cap')).length;
  console.log(`Large & Mid Cap funds - Strict match: ${largeMidStrict}, Normalized match: ${largeMidNorm}`);
  
  const invescoInStrict = funds.filter(f => f.category === 'Equity Scheme - Large & Mid Cap Fund' && f.name.includes('Invesco')).length;
  const invescoInNorm = funds.filter(f => normCat(f.category).includes('large & mid cap') && f.name.includes('Invesco')).length;
  console.log(`Invesco Large & Mid Cap - Strict: ${invescoInStrict}, Normalized: ${invescoInNorm}`);

  await client.end();
}

main().catch(console.error);
