const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/POSTGRES_URL=["']?([^"'\r\n]+)/);
const connStr = match ? match[1] : process.env.POSTGRES_URL;

const { Client } = require('pg');
const client = new Client({ connectionString: connStr });

function normalizeCategory(c = '') {
  if (!c || c === 'All') return 'All';
  let cat = c
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

  // Merge Sectoral & Thematic
  if (/^sectoral|^thematic|sectoral\s*\/\s*thematic/i.test(cat)) {
    return 'sectoral / thematic';
  }

  // Merge Value & Contra (SEBI mandate allows an AMC to have either Value or Contra, not both)
  if (/^value$|^contra$|value\s*\/\s*contra/i.test(cat)) {
    return 'value / contra';
  }

  return cat;
}

async function main() {
  await client.connect();
  const res = await client.query("SELECT code, name, category FROM mf_screener");
  const funds = res.rows;

  const sectoralCount = funds.filter(f => normalizeCategory(f.category) === 'sectoral / thematic').length;
  const valueContraCount = funds.filter(f => normalizeCategory(f.category) === 'value / contra').length;

  console.log(`Sectoral / Thematic combined funds: ${sectoralCount}`);
  console.log(`Value / Contra combined funds: ${valueContraCount}`);

  await client.end();
}

main().catch(console.error);
