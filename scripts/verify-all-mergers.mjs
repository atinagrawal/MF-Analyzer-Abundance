import pg from 'pg';
import fs from 'fs';
import path from 'path';

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

async function main() {
  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('=== Step 1: Auditing ALL existing entries in data/scheme-lineage.json ===');
  const lineagePath = path.join(process.cwd(), 'data', 'scheme-lineage.json');
  const LINEAGE = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));

  const results = [];
  for (const [code, info] of Object.entries(LINEAGE)) {
    try {
      const curRes = await fetch(`https://api.mfapi.in/mf/${code}`).then(r => r.json()).catch(() => null);
      const predRes = await fetch(`https://api.mfapi.in/mf/${info.pred}`).then(r => r.json()).catch(() => null);

      if (!curRes?.data?.length || !predRes?.data?.length) {
        results.push({ code, pred: info.pred, status: 'NO_DATA', error: 'Missing data on mfapi' });
        continue;
      }

      const cFirst = curRes.data[curRes.data.length - 1];
      const pLast = predRes.data[0];
      const [cdd, cmm, cyy] = cFirst.date.split('-').map(Number);
      const [pdd, pmm, pyy] = pLast.date.split('-').map(Number);
      const ct = Date.UTC(cyy, cmm - 1, cdd);
      const pt = Date.UTC(pyy, pmm - 1, pdd);
      const gapDays = (ct - pt) / 86400000;
      const ratio = parseFloat(cFirst.nav) / parseFloat(pLast.nav);

      results.push({
        code,
        curName: curRes.meta?.scheme_name,
        pred: info.pred,
        predName: predRes.meta?.scheme_name,
        gapDays,
        ratio,
        cStart: cFirst.date,
        pEnd: pLast.date,
        pStart: predRes.data[predRes.data.length - 1].date,
        status: (gapDays >= 0 && gapDays <= 30 && isFinite(ratio) && ratio > 0) ? 'OK' : 'CHECK'
      });
    } catch (e) {
      results.push({ code, pred: info.pred, status: 'ERROR', error: e.message });
    }
  }

  for (const r of results) {
    if (r.status === 'OK') {
      console.log(`✅ [${r.code}] ${r.curName} <- [${r.pred}] ${r.predName} | Gap: ${r.gapDays}d | Ratio: ${r.ratio?.toFixed(4)} | History back to: ${r.pStart}`);
    } else {
      console.log(`⚠️ [${r.code}] <- [${r.pred}] | Status: ${r.status} | Gap: ${r.gapDays}d | Ratio: ${r.ratio} | Error: ${r.error || ''}`);
    }
  }

  await client.end();
}

main().catch(console.error);
