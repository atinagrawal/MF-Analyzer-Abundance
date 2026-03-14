// /api/mf-portfolio?amc=NIPPON&scheme=Nippon+India+Flexi+Cap+Fund
// Returns parsed holdings JSON from AMC monthly portfolio XLS/PDF files
// Strategy: hardcoded URL templates per AMC, HEAD-check each URL, fallback to prev month

export const config = { runtime: 'nodejs' };

const https = require('https');
const http = require('http');
const zlib = require('zlib');

// Nippon month abbreviations (exact casing from confirmed URLs)
// April, June, July use full names; others use 3-letter abbreviations
const NIPPON_MONTH_NAMES = ['Jan','Feb','Mar','April','May','June','July','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LAST_DAY = [31,28,31,30,31,30,31,31,30,31,30,31];

function nipponLastDay(year, month0) {
  if (month0 === 1) return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28;
  return MONTH_LAST_DAY[month0];
}

function nipponUrls(year, month0) {
  const mon = NIPPON_MONTH_NAMES[month0];
  const yy = String(year).slice(2);
  const day = nipponLastDay(year, month0);
  const dd = String(day).padStart(2, '0');
  const base = 'https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/';
  return [
    `${base}NIMF-MONTHLY-PORTFOLIO-${dd}-${mon}-${yy}.xls`,
    `${base}NIMF-MONTHLY-PORTFOLIO-${mon}-${yy}.xls`,
    `${base}NIMF_MONTHLY_PORTFOLIO_${dd}-${mon}-${yy}.xls`,
    `${base}NIMF-MONTHLY-PORTFOLIO-${dd}-${mon}-${yy}.xlsx`,
  ];
}

// --- AMC URL Templates ---
// Each AMC has: url(year, mon, mm, yy, month0) -> string[]
// mon = 'January', mm = '01', yy = '26', month0 = 0-indexed month

const MONTHS_FULL = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

const AMC_CONFIG = {
  // CONFIRMED: XLS files at mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/
  NIPPON: {
    name: 'Nippon India',
    fileType: 'xls',
    url: (year, mon, mm, yy, month0) => nipponUrls(parseInt(year), parseInt(month0)),
    confidence: 'high',
  },
  // CONFIRMED: ppfas-mf-factsheet-for-{Month}-{YYYY}.pdf verified live
  PPFAS: {
    name: 'Parag Parikh',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://amc.ppfas.com/downloads/factsheet/${year}/ppfas-mf-factsheet-for-${mon}-${year}.pdf`,
      `https://amc.ppfas.com/schemes/scheme-financials/${mon.toLowerCase()}-${year}/monthly-portfolio-disclosure-${mon.toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'high',
  },
  HDFC: {
    name: 'HDFC',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Portfolio-${mon}-${year}.pdf`,
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}-Equity.pdf`,
    ],
    confidence: 'medium',
  },
  SBI: {
    name: 'SBI',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.sbimf.com/docs/default-source/scheme-portfolios/${mon.toLowerCase()}${yy}port.pdf`,
      `https://www.sbimf.com/docs/default-source/scheme-portfolios/${mon.substring(0,3).toLowerCase()}${yy}port.pdf`,
    ],
    confidence: 'medium',
  },
  ABSL: {
    name: 'Aditya Birla Sun Life',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://mutualfund.adityabirlacapital.com/downloads/portfolio/monthly-portfolio-${mon.toLowerCase()}-${yy}.pdf`,
      `https://mutualfund.adityabirlacapital.com/downloads/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${yy}.pdf`,
    ],
    confidence: 'medium',
  },
  ICICI: {
    name: 'ICICI Prudential',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.icicipruamc.com/docs/default-source/monthly-portfolio/portfolio-${mon.toLowerCase()}${year}.pdf`,
      `https://www.icicipruamc.com/docs/default-source/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.icicipruamc.com/docs/default-source/monthly-portfolio/ipamc-monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'medium',
  },
  MIRAE: {
    name: 'Mirae Asset',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.miraeassetmf.co.in/docs/default-source/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.miraeassetmf.co.in/docs/default-source/monthly-portfolio/mirae-asset-mf-portfolio-${mon.toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'medium',
  },
  KOTAK: {
    name: 'Kotak',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.kotakmf.com/docs/default-source/portfolio/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.kotakmf.com/getmedia/monthly-portfolio-${mon.toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  AXIS: {
    name: 'Axis',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.axismf.com/downloads/portfolio/${mon.substring(0,3).toLowerCase()}-${year}-monthly-portfolio.pdf`,
      `https://www.axismf.com/downloads/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  UTI: {
    name: 'UTI',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.utimf.com/portfolio-disclosure/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.utimf.com/content/dam/uti/downloads/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  DSP: {
    name: 'DSP',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.dspim.com/content/dam/dsp/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.dspim.com/downloads/portfolio/dsp-monthly-portfolio-${mon.toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  FRANKLIN: {
    name: 'Franklin Templeton',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.franklintempletonindia.com/downloadsServlet/pdf/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  TATA: {
    name: 'Tata',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.tatamutualfund.com/docs/default-source/portfolio/monthly-portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  INVESCO: {
    name: 'Invesco',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.invescomutualfund.com/docs/default-source/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  BANDHAN: {
    name: 'Bandhan',
    fileType: 'pdf',
    url: (year, mon, mm, yy) => [
      `https://www.bandhanmf.com/uploads/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
};

// --- Month helpers ---
function getMonthParams(date) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed
  return {
    year: String(y),
    mon: MONTHS_FULL[m],
    mm: String(m + 1).padStart(2, '0'),
    yy: String(y).slice(2),
    month0: m,
  };
}

// --- HTTP helpers ---
function httpHead(urlStr, timeout = 6000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request({
        hostname: u.hostname, path: u.pathname + u.search,
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/1.0)' },
        timeout,
      }, (res) => resolve(res.statusCode));
      req.on('error', () => resolve(0));
      req.on('timeout', () => { req.destroy(); resolve(0); });
      req.end();
    } catch { resolve(0); }
  });
}

function httpGet(urlStr, timeout = 28000) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.get({
        hostname: u.hostname, path: u.pathname + u.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/1.0)',
          'Accept': 'application/vnd.ms-excel,application/pdf,*/*',
        },
        timeout,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpGet(res.headers.location, timeout).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    } catch (e) { reject(e); }
  });
}

// --- XLSX parser (pure JS, uses built-in zlib for ZIP/deflate) ---
// XLSX = ZIP file containing xl/sharedStrings.xml + xl/worksheets/sheetN.xml
function colLetterToNum(letters) {
  let n = 0;
  for (const c of letters) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1; // 0-indexed
}

function extractZipEntries(buf) {
  const entries = {};
  let pos = 0;
  let safety = 0;
  while (pos + 30 <= buf.length && safety++ < 5000) {
    const sig = buf.readUInt32LE(pos);
    if (sig === 0x06054B50 || sig === 0x02014B50) break; // end/central dir
    if (sig !== 0x04034B50) { pos++; continue; } // not local file header
    const method    = buf.readUInt16LE(pos + 8);
    const compSize  = buf.readUInt32LE(pos + 18);
    const nameLen   = buf.readUInt16LE(pos + 26);
    const extraLen  = buf.readUInt16LE(pos + 28);
    const name      = buf.slice(pos + 30, pos + 30 + nameLen).toString('utf8');
    const dataStart = pos + 30 + nameLen + extraLen;
    const dataEnd   = dataStart + compSize;
    if (compSize > 0 && dataEnd <= buf.length) {
      const compData = buf.slice(dataStart, dataEnd);
      try {
        entries[name] = (method === 0) ? compData : zlib.inflateRawSync(compData);
      } catch { entries[name] = compData; }
    }
    pos = (compSize > 0) ? dataEnd : pos + 30 + nameLen + extraLen;
  }
  return entries;
}

function parseSheetXml(sheetXml, sst) {
  const matrix = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowM;
  while ((rowM = rowRegex.exec(sheetXml)) !== null) {
    const cells = [];
    const cellRegex = /<c\s([^>]*)>([\s\S]*?)<\/c>/g;
    let cellM;
    while ((cellM = cellRegex.exec(rowM[1])) !== null) {
      const attrs  = cellM[1];
      const inner  = cellM[2];
      const typeM  = attrs.match(/\bt="([^"]+)"/);
      const type   = typeM ? typeM[1] : 'n';
      const refM   = attrs.match(/\br="([A-Z]+)\d+"/);
      const colIdx = refM ? colLetterToNum(refM[1]) : cells.length;
      const vM     = inner.match(/<v>([\s\S]*?)<\/v>/);
      const tM     = inner.match(/<t>([\s\S]*?)<\/t>/);
      let val = '';
      if (vM) {
        val = (type === 's') ? (sst[parseInt(vM[1])] || '') : vM[1];
      } else if (tM) {
        val = tM[1];
      }
      val = val.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
      cells.push({ col: colIdx, val });
    }
    if (cells.length) {
      const maxCol = Math.max(...cells.map(c => c.col));
      const arr = new Array(maxCol + 1).fill('');
      cells.forEach(c => { arr[c.col] = c.val; });
      matrix.push(arr);
    }
  }
  return matrix;
}

function parseXLSX(buf) {
  // Returns { indexMatrix, sheetFiles, entries, sst }
  // indexMatrix = sheet1 (index of schemes)
  // Call parseXLSXSheet(result, sheetNum) to get a specific sheet's matrix
  const entries = extractZipEntries(buf);
  const entryNames = Object.keys(entries);

  // 1. Shared string table
  const sst = [];
  const sstBuf = entries['xl/sharedStrings.xml'] || entries['xl/SharedStrings.xml'];
  if (sstBuf) {
    const sstText = sstBuf.toString('utf8');
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = siRegex.exec(sstText)) !== null) {
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tm; const parts = [];
      while ((tm = tRegex.exec(m[1])) !== null) {
        parts.push(tm[1]
          .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          .replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(parseInt(n))));
      }
      sst.push(parts.join(''));
    }
  }

  // 2. Sorted sheet list
  const sheetFiles = entryNames
    .filter(n => /xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/sheet(\d+)/)[1]) - parseInt(b.match(/sheet(\d+)/)[1]));

  if (!sheetFiles.length) return null;

  // 3. Parse sheet1 as index
  const indexMatrix = parseSheetXml(entries[sheetFiles[0]].toString('utf8'), sst);

  return { indexMatrix, sheetFiles, entries, sst };
}

function parseXLSXSheet(xlsxResult, sheetNum) {
  // sheetNum is 1-based (sheet1 = index, sheet2 = first scheme, etc.)
  const { sheetFiles, entries, sst } = xlsxResult;
  const idx = sheetNum - 1; // 0-indexed into sheetFiles
  if (idx < 0 || idx >= sheetFiles.length) return [];
  return parseSheetXml(entries[sheetFiles[idx]].toString('utf8'), sst);
}

function findSchemeSheetNum(xlsxResult, schemeName) {
  // Search index sheet for scheme name, return sheet number (2-based since sheet1=index)
  const { indexMatrix } = xlsxResult;
  const norm = schemeName.toLowerCase().replace(/\s+/g,' ').trim();
  // Try progressively shorter prefixes to handle partial matches
  for (let prefixLen = Math.min(norm.length, 30); prefixLen >= 10; prefixLen -= 5) {
    const prefix = norm.substring(0, prefixLen);
    for (let i = 0; i < indexMatrix.length; i++) {
      const row = indexMatrix[i];
      // Check all cells in the row
      for (const cell of row) {
        if (cell && cell.toLowerCase().replace(/\s+/g,' ').includes(prefix)) {
          return i + 2; // +1 for 1-based, +1 because sheet1=index
        }
      }
    }
  }
  return -1;
}

// --- BIFF8 XLS parser (kept for CFB-format files) ---
function parseXLS(buf) {
  const rows = {};
  if (buf.length < 8) return rows;
  if (buf[0] !== 0xD0 || buf[1] !== 0xCF || buf[2] !== 0x11 || buf[3] !== 0xE0) return rows;
  const workbookBuf = extractCFBStream(buf, 'Workbook') || extractCFBStream(buf, 'Book');
  if (!workbookBuf) return rows;
  const sst = [];
  let pos = 0;
  while (pos + 4 <= workbookBuf.length) {
    const recType = workbookBuf.readUInt16LE(pos);
    const recLen  = workbookBuf.readUInt16LE(pos + 2);
    pos += 4;
    if (pos + recLen > workbookBuf.length) break;
    const data = workbookBuf.slice(pos, pos + recLen);
    pos += recLen;
    if (recType === 0x00FC) { parseSSTRecord(data, sst); }
    else if (recType === 0x00FD && data.length >= 8) {
      const row = data.readUInt16LE(0), col = data.readUInt16LE(2);
      const sstIdx = data.readUInt32LE(6);
      if (!rows[row]) rows[row] = {};
      rows[row][col] = sst[sstIdx] || '';
    } else if (recType === 0x0204 && data.length >= 8) {
      const row = data.readUInt16LE(0), col = data.readUInt16LE(2);
      const len = data.readUInt16LE(6);
      if (!rows[row]) rows[row] = {};
      rows[row][col] = data.slice(8, 8 + len).toString('latin1');
    } else if (recType === 0x0203 && data.length >= 14) {
      const row = data.readUInt16LE(0), col = data.readUInt16LE(2);
      const val = data.readDoubleBE(6);
      if (!rows[row]) rows[row] = {};
      rows[row][col] = isNaN(val) ? '' : String(val);
    } else if (recType === 0x027E && data.length >= 8) {
      const row = data.readUInt16LE(0), col = data.readUInt16LE(2);
      if (!rows[row]) rows[row] = {};
      rows[row][col] = String(rkToNum(data.readUInt32LE(4)));
    } else if (recType === 0x00BD && data.length >= 6) {
      const row = data.readUInt16LE(0), firstCol = data.readUInt16LE(2);
      const count = (data.length - 6) / 6;
      for (let i = 0; i < count; i++) {
        const col = firstCol + i;
        if (!rows[row]) rows[row] = {};
        rows[row][col] = String(rkToNum(data.readUInt32LE(4 + i * 6 + 2)));
      }
    }
  }
  return rows;
}

function rkToNum(rk) {
  let val;
  if (rk & 0x02) { val = rk >> 2; }
  else { const b = Buffer.alloc(8); b.writeUInt32LE(rk & 0xFFFFFFFC, 4); val = b.readDoubleBE(0); }
  if (rk & 0x01) val /= 100;
  return val;
}

function parseSSTRecord(data, sst) {
  if (data.length < 8) return;
  const count = data.readUInt32LE(4);
  let pos = 8;
  for (let i = 0; i < count && pos < data.length; i++) {
    if (pos + 3 > data.length) break;
    const charCount = data.readUInt16LE(pos);
    const flags = data[pos + 2];
    const isUnicode = (flags & 0x01) !== 0;
    const hasRichText = (flags & 0x08) !== 0;
    const hasExt = (flags & 0x04) !== 0;
    pos += 3;
    let richCount = 0, extLen = 0;
    if (hasRichText && pos + 2 <= data.length) { richCount = data.readUInt16LE(pos); pos += 2; }
    if (hasExt && pos + 4 <= data.length) { extLen = data.readUInt32LE(pos); pos += 4; }
    const byteLen = isUnicode ? charCount * 2 : charCount;
    if (pos + byteLen > data.length) { sst.push(''); break; }
    sst.push(isUnicode
      ? data.slice(pos, pos + byteLen).toString('utf16le')
      : data.slice(pos, pos + byteLen).toString('latin1'));
    pos += byteLen + richCount * 4 + extLen;
  }
}

function extractCFBStream(buf, streamName) {
  const sectorSize = 1 << buf.readUInt16LE(30);
  const fatCount = buf.readUInt32LE(44);
  const firstDirSector = buf.readUInt32LE(48);
  const fatSectors = [];
  for (let i = 0; i < Math.min(fatCount, 109); i++) {
    const s = buf.readUInt32LE(76 + i * 4);
    if (s >= 0xFFFFFFFA) break;
    fatSectors.push(s);
  }
  function readSector(id) {
    const off = (id + 1) * sectorSize;
    return (off + sectorSize <= buf.length) ? buf.slice(off, off + sectorSize) : Buffer.alloc(0);
  }
  const fat = [];
  for (const s of fatSectors) {
    const sec = readSector(s);
    for (let i = 0; i + 4 <= sec.length; i += 4) fat.push(sec.readUInt32LE(i));
  }
  function followChain(start) {
    const chunks = []; let cur = start; const visited = new Set();
    while (cur < 0xFFFFFFF8 && !visited.has(cur) && cur < fat.length) {
      visited.add(cur); chunks.push(readSector(cur)); cur = fat[cur];
    }
    return Buffer.concat(chunks);
  }
  const dirData = followChain(firstDirSector);
  for (let i = 0; i * 128 < dirData.length; i++) {
    const off = i * 128;
    if (off + 128 > dirData.length) break;
    const nameLen = dirData.readUInt16LE(off + 64);
    if (nameLen < 2) continue;
    const name = dirData.slice(off, off + Math.min(nameLen - 2, 64)).toString('utf16le');
    if (dirData[off + 66] !== 2) continue;
    if (name.toLowerCase() !== streamName.toLowerCase()) continue;
    return followChain(dirData.readUInt32LE(off + 116)).slice(0, dirData.readUInt32LE(off + 120));
  }
  return null;
}

// Convert BIFF8 row/col map to matrix
function xlsRowsToMatrix(rows) {
  const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b);
  if (!rowNums.length) return [];
  const maxRow = rowNums[rowNums.length - 1];
  const result = [];
  for (let r = 0; r <= maxRow; r++) {
    const row = rows[r] || {};
    const colNums = Object.keys(row).map(Number);
    if (!colNums.length) { result.push([]); continue; }
    const maxCol = Math.max(...colNums);
    const arr = [];
    for (let c = 0; c <= maxCol; c++) arr.push(row[c] !== undefined ? String(row[c]).trim() : '');
    result.push(arr);
  }
  return result;
}


// --- HTML-as-XLS table parser ---
// Many Indian AMC sites serve HTML tables with .xls extension (Excel "Save as Web Page")
function parseHTMLTable(buf) {
  // Try cp1252 / utf-8 decode
  let html;
  try { html = buf.toString('utf8'); } catch { html = buf.toString('latin1'); }

  const matrix = [];
  // Strip scripts/styles
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
             .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Find all <tr> blocks
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    const cells = [];
    // Find all <td> and <th> cells
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      // Strip inner tags, decode entities
      let cellText = tdMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(cellText);
    }
    if (cells.length > 0) matrix.push(cells);
  }
  return matrix;
}

// --- Holdings parser for XLS/XLSX matrix ---
function parseHoldingsFromXLS(matrix, schemeName) {
  const holdings = [];

  // For Nippon-style: each sheet IS one scheme, no need to find a scheme section.
  // Just find the header row (ISIN | Name of Instrument | ... | % to NAV) and parse below it.
  // For multi-scheme sheets: also try to find the scheme section first.

  let headerRow = -1;
  let nameCol = -1, pctCol = -1, isinCol = -1, mktValCol = -1, ratingCol = -1, sectorCol = -1;

  const nameKws  = ['name of instrument', 'security name', 'name of security', 'issuer',
                    'company name', 'scrip name', 'instrument name', 'name of the instrument'];
  const pctKws   = ['% to nav', '% of nav', '% to net assets', 'percentage to nav',
                    '% tonav', '%tonav', 'nav %'];
  const isinKws  = ['isin', 'isin code', 'isin no'];
  const mktKws   = ['market value', 'mkt value', 'market val', 'market price'];
  const stopKws  = ['grand total', 'total net assets', 'net assets', 'total of'];

  // Scan for header row
  for (let r = 0; r < Math.min(matrix.length, 20); r++) {
    const row = matrix[r];
    const rowText = row.join(' ').toLowerCase();
    const hasNameKw = nameKws.some(kw => rowText.includes(kw));
    const hasPctKw  = pctKws.some(kw => rowText.includes(kw));
    // Header row must have at least a name keyword OR (a pct keyword AND an isin keyword)
    if (hasNameKw || (hasPctKw && rowText.includes('isin'))) {
      headerRow = r;
      row.forEach((cell, ci) => {
        const cl = cell.toLowerCase().replace(/\s+/g,' ').trim();
        if (nameCol  === -1 && nameKws.some(kw => cl.includes(kw)))  nameCol  = ci;
        if (pctCol   === -1 && pctKws.some(kw => cl.includes(kw)))   pctCol   = ci;
        if (isinCol  === -1 && isinKws.some(kw => cl.includes(kw)))  isinCol  = ci;
        if (mktValCol=== -1 && mktKws.some(kw => cl.includes(kw)))   mktValCol= ci;
      });
      if (nameCol === -1) nameCol = 1; // Nippon typical: col0=ISIN, col1=name
      break;
    }
  }

  // If no header found, try heuristic: first row with an ISIN-like value defines data start
  let dataStart = headerRow >= 0 ? headerRow + 1 : 0;
  if (headerRow === -1) {
    for (let r = 0; r < Math.min(matrix.length, 30); r++) {
      if (matrix[r].some(c => /^INE[A-Z0-9]{9}$/.test(c.trim()))) {
        dataStart = r;
        // Try to infer columns from this row
        const row = matrix[r];
        isinCol = row.findIndex(c => /^INE[A-Z0-9]{9}$/.test(c.trim()));
        nameCol = isinCol >= 0 ? isinCol + 1 : 1;
        break;
      }
    }
  }

  // Parse data rows
  for (let r = dataStart; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || !row.length) continue;
    const rowText = row.join(' ').toLowerCase();

    // Stop at total/summary rows
    if (stopKws.some(kw => rowText.includes(kw))) break;
    // Skip rows that are sub-headers (e.g. "Equity & Equity Related", "Debt Instruments")
    const firstCell = (row[0] || '').trim();
    if (firstCell && row.filter(c => c.trim()).length <= 2 && !firstCell.match(/^INE/)) continue;

    // Extract ISIN
    let isin = null;
    if (isinCol >= 0) {
      isin = (row[isinCol] || '').trim() || null;
      if (isin && !/^INE[A-Z0-9]{9}$/.test(isin)) isin = null;
    }
    // Also scan whole row for ISIN pattern
    if (!isin) {
      const isinMatch = row.join(' ').match(/\bINE[A-Z0-9]{9}\b/);
      if (isinMatch) isin = isinMatch[0];
    }

    // Extract name
    let name = '';
    if (nameCol >= 0) name = (row[nameCol] || '').trim();
    if (!name && isinCol >= 0) name = (row[isinCol + 1] || '').trim(); // fallback: cell after ISIN
    if (!name) name = firstCell;
    name = name.replace(/^INE[A-Z0-9]{9}\s*/, '').trim();
    if (!name || name.length < 3 || name.length > 150) continue;
    if (nameKws.some(kw => name.toLowerCase().includes(kw))) continue;
    if (name.match(/^\d/)) continue;

    // Extract % to NAV
    let pct = NaN;
    if (pctCol >= 0 && row[pctCol]) {
      pct = parseFloat(String(row[pctCol]).replace(/[^0-9.-]/g, ''));
    }
    if (isNaN(pct) || pct <= 0) {
      // Scan from right for a plausible % value
      for (let c = row.length - 1; c >= 1; c--) {
        const v = parseFloat(String(row[c] || '').replace(/[^0-9.-]/g, ''));
        if (!isNaN(v) && v > 0 && v <= 50) { pct = v; break; }
      }
    }
    if (isNaN(pct) || pct <= 0 || pct > 50) continue;

    // Extract market value (optional)
    let mktVal = null;
    if (mktValCol >= 0 && row[mktValCol]) {
      mktVal = parseFloat(String(row[mktValCol]).replace(/[^0-9.]/g, '')) || null;
    }

    holdings.push({ name, isin, pct, mktVal });
  }

  const seen = new Set();
  return holdings
    .filter(h => { if (seen.has(h.name)) return false; seen.add(h.name); return true; })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 80);
}


// --- PDF text extractor (for non-Nippon AMCs, no external deps) ---
function extractTextFromPDF(buf) {
  const str = buf.toString('latin1');
  const texts = [];
  let pos = 0;
  while (true) {
    const streamStart = str.indexOf('stream', pos);
    if (streamStart === -1) break;
    const streamEnd = str.indexOf('endstream', streamStart);
    if (streamEnd === -1) break;
    const dictStart = str.lastIndexOf('<<', streamStart);
    const dict = str.slice(dictStart, streamStart);
    const isFlate = dict.includes('FlateDecode') || dict.includes('Fl\n');
    const rawStream = buf.slice(streamStart + 7, streamEnd);
    try {
      let decoded;
      if (isFlate) {
        try { decoded = zlib.inflateSync(rawStream).toString('utf8'); }
        catch { decoded = rawStream.toString('latin1'); }
      } else {
        decoded = rawStream.toString('latin1');
      }
      const btRegex = /BT\s*([\s\S]*?)\s*ET/g;
      let m;
      while ((m = btRegex.exec(decoded)) !== null) {
        const block = m[1];
        const strRegex = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|(\[(?:[^\]]*)\])\s*TJ/g;
        let sm;
        while ((sm = strRegex.exec(block)) !== null) {
          if (sm[1] !== undefined) {
            texts.push(unescape(sm[1].replace(/\\([0-7]{3})/g,
              (_, o) => String.fromCharCode(parseInt(o, 8)))));
          } else if (sm[2]) {
            const tjStr = sm[2].replace(/\(((?:[^()\\]|\\.)*)\)/g, (_, s) => s + ' ');
            texts.push(tjStr.replace(/\s+/g, ' ').trim());
          }
        }
      }
    } catch { /* skip bad streams */ }
    pos = streamEnd + 9;
  }
  return texts.join('\n').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
}

function parseHoldingsFromPDF(text, schemeName) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const holdings = [];
  const schemeNorm = (schemeName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let inScheme = !schemeNorm;
  let inHoldings = false;
  const headerKeywords = ['name of instrument', 'security name', 'name of security',
    'issuer', 'company name', 'scrip name'];
  const stopKeywords = ['total', 'grand total', 'sub total', 'net assets'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ll = line.toLowerCase();
    if (!inScheme && schemeNorm && ll.includes(schemeNorm.substring(0, 20))) inScheme = true;
    if (headerKeywords.some(kw => ll.includes(kw))) { inHoldings = true; continue; }
    if (!inHoldings) continue;
    if (stopKeywords.some(kw => ll.startsWith(kw)) && holdings.length > 0) {
      if (ll.includes('grand total') || ll.includes('net assets')) break;
    }
    const pctMatch = line.match(/(\d{1,3}\.\d{1,4})\s*$/);
    if (!pctMatch) continue;
    const pct = parseFloat(pctMatch[1]);
    if (pct <= 0 || pct > 50) continue;
    const namePart = line.replace(/[\d,\s.%]+$/, '').trim();
    if (namePart.length < 3 || namePart.length > 100) continue;
    if (headerKeywords.some(kw => namePart.toLowerCase().includes(kw))) continue;
    const isinMatch = line.match(/INE[A-Z0-9]{9}/);
    const isin = isinMatch ? isinMatch[0] : null;
    let name = namePart.replace(/^INE[A-Z0-9]{9}\s*/, '').trim();
    if (!name || name.match(/^\d/)) continue;
    holdings.push({ name, isin, pct });
  }

  const seen = new Set();
  return holdings
    .filter(h => { if (seen.has(h.name)) return false; seen.add(h.name); return true; })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 50);
}

// --- URL discovery ---
async function findWorkingURL(amcKey, date, collectTriedUrls) {
  const cfg = AMC_CONFIG[amcKey];
  if (!cfg) return null;

  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - monthOffset);
    const params = getMonthParams(d);
    const urls = cfg.url(params.year, params.mon, params.mm, params.yy, params.month0);

    for (const url of urls) {
      try {
        const status = await httpHead(url);
        if (collectTriedUrls) collectTriedUrls.push({ url, status });
        if (status === 200 || status === 302) {
          return { url, ...params, monthOffset, fileType: cfg.fileType };
        }
      } catch (e) {
        if (collectTriedUrls) collectTriedUrls.push({ url, status: 0, error: e.message });
      }
    }
  }
  return null;
}

// --- Main handler ---
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { amc, scheme, action } = req.query;

  if (action === 'list') {
    return res.json({
      amcs: Object.entries(AMC_CONFIG).map(([key, cfg]) => ({
        key, name: cfg.name, confidence: cfg.confidence, fileType: cfg.fileType,
      })),
    });
  }

  // Action: schemes -> list all scheme names in the XLSX index sheet
  // Action: sheet -> return sample rows from a specific sheet number
  if (action === 'sheet' && amc) {
    const amcKey = amc.toUpperCase();
    if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC: ${amc}` });
    const sheetNum = parseInt(req.query.sheetNum || '2');
    const found = await findWorkingURL(amcKey, new Date(), null);
    if (!found) return res.status(404).json({ error: 'No working URL found' });
    let fileBuf;
    try { fileBuf = await httpGet(found.url, 25000); } catch (e) {
      return res.status(503).json({ error: e.message });
    }
    const magic = fileBuf.slice(0, 4).toString('hex');
    if (magic !== '504b0304') return res.status(422).json({ error: 'Not an XLSX file', magic });
    const xlsxResult = parseXLSX(fileBuf);
    if (!xlsxResult) return res.status(422).json({ error: 'Could not parse XLSX' });
    const matrix = parseXLSXSheet(xlsxResult, sheetNum);
    // Also test findSchemeSheetNum if scheme passed
    let foundSheetNum = null;
    if (req.query.scheme) foundSheetNum = findSchemeSheetNum(xlsxResult, req.query.scheme);
    return res.json({
      sheetNum, rows: matrix.length,
      sampleRows: matrix.slice(0, 20).map(r => r.slice(0, 10)),
      foundSheetNum,
    });
  }

  if (action === 'schemes' && amc) {
    const amcKey = amc.toUpperCase();
    if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC: ${amc}` });
    const found = await findWorkingURL(amcKey, new Date(), null);
    if (!found) return res.status(404).json({ error: 'No working URL found' });
    let fileBuf;
    try { fileBuf = await httpGet(found.url, 25000); } catch (e) {
      return res.status(503).json({ error: e.message });
    }
    const magic = fileBuf.slice(0, 4).toString('hex');
    if (magic !== '504b0304') return res.status(422).json({ error: 'Not an XLSX file', magic });
    const xlsxResult = parseXLSX(fileBuf);
    if (!xlsxResult) return res.status(422).json({ error: 'Could not parse XLSX' });
    const schemes = xlsxResult.indexMatrix
      .filter(r => r[0] && r[1] && r[0] !== 'INDEX')
      .map((r, i) => ({ code: r[0], name: r[1].split('\n')[0].trim(), sheetNum: i + 2 }));
    return res.json({ amc: amcKey, month: found.mon, year: found.year,
      url: found.url, totalSheets: xlsxResult.sheetFiles.length, schemes });
  }

  // Action: debug -> download file and return diagnostics
  if (action === 'debug' && amc) {
    const amcKey = amc.toUpperCase();
    if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC: ${amc}` });
    const found = await findWorkingURL(amcKey, new Date(), null);
    if (!found) return res.status(404).json({ error: 'No working URL found', amc: amcKey });
    let fileBuf;
    try { fileBuf = await httpGet(found.url, 25000); } catch (e) {
      return res.status(503).json({ error: e.message, url: found.url });
    }
    const magic = fileBuf.slice(0, 8).toString('hex');
    const isCFB  = magic.startsWith('d0cf11e0');
    const isZIP  = magic.startsWith('504b0304');
    const first100 = fileBuf.slice(0, 100).toString('utf8').toLowerCase();
    const isHTML = magic.startsWith('3c68746d') || magic.startsWith('3c48544d') ||
                   first100.includes('<html') || first100.includes('<table');
    let indexSample = [], sheet2Sample = [], totalSheets = 0;
    if (isZIP) {
      const xlsxResult = parseXLSX(fileBuf);
      if (xlsxResult) {
        totalSheets = xlsxResult.sheetFiles.length;
        indexSample = xlsxResult.indexMatrix.slice(0, 25).map(r => r.slice(0, 3));
        const sheet2 = parseXLSXSheet(xlsxResult, 2);
        sheet2Sample = sheet2.slice(0, 15).map(r => r.slice(0, 8));
      }
    } else if (isHTML) {
      indexSample = parseHTMLTable(fileBuf).slice(0, 20).map(r => r.slice(0, 8));
    } else if (isCFB) {
      indexSample = xlsRowsToMatrix(parseXLS(fileBuf)).slice(0, 20).map(r => r.slice(0, 8));
    }
    return res.json({
      url: found.url, fileSize: fileBuf.length, magic, isCFB, isZIP, isHTML,
      totalSheets, indexSample, sheet2Sample,
    });
  }

  if (action === 'probe' && amc) {
    const amcKey = amc.toUpperCase();
    if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC: ${amc}` });
    const tried = [];
    const result = await findWorkingURL(amcKey, new Date(), tried);
    if (!result) return res.status(404).json({ error: 'No working URL found', amc: amcKey, tried });
    return res.json({ amc: amcKey, name: AMC_CONFIG[amcKey].name, url: result.url,
      month: result.mon, year: result.year, monthOffset: result.monthOffset,
      fileType: result.fileType, tried });
  }

  if (!amc) {
    return res.status(400).json({
      error: 'Missing ?amc= parameter',
      example: '/api/mf-portfolio?amc=NIPPON&scheme=Nippon+India+Flexi+Cap+Fund',
      available: Object.keys(AMC_CONFIG),
    });
  }

  const amcKey = amc.toUpperCase();
  if (!AMC_CONFIG[amcKey]) {
    return res.status(400).json({ error: `Unknown AMC: ${amc}`, available: Object.keys(AMC_CONFIG) });
  }

  try {
    const found = await findWorkingURL(amcKey, new Date(), null);
    if (!found) {
      return res.status(503).json({
        error: 'Could not find portfolio file for this AMC',
        amc: amcKey, confidence: AMC_CONFIG[amcKey].confidence,
        hint: 'URL pattern may have changed. Please report this.',
      });
    }

    let fileBuf;
    try {
      fileBuf = await httpGet(found.url, 25000);
    } catch (e) {
      return res.status(503).json({ error: `File fetch failed: ${e.message}`, url: found.url });
    }

    if (fileBuf.length > 20 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (>20MB)', size: fileBuf.length });
    }

    let holdings = [];
    const fileType = found.fileType || AMC_CONFIG[amcKey].fileType || 'pdf';

    if (fileType === 'xls' || fileType === 'xlsx') {
      const magic = fileBuf.slice(0, 4).toString('hex');
      const isZIP  = magic === '504b0304';
      const isCFB  = magic === 'd0cf11e0';
      const isHTML = magic === '3c68746d' || magic === '3c48544d' ||
                     fileBuf.slice(0, 100).toString('utf8').toLowerCase().includes('<html') ||
                     fileBuf.slice(0, 100).toString('utf8').toLowerCase().includes('<table');
      let matrix = [];
      if (isZIP) {
        const xlsxResult = parseXLSX(fileBuf);
        if (xlsxResult) {
          if (scheme) {
            // Find the sheet for this scheme
            const sheetNum = findSchemeSheetNum(xlsxResult, scheme);
            if (sheetNum > 0) {
              matrix = parseXLSXSheet(xlsxResult, sheetNum);
            } else {
              // Scheme not found in index - try to find it by scanning all sheets
              // Fall back to sheet2 (first scheme sheet)
              matrix = parseXLSXSheet(xlsxResult, 2);
            }
          } else {
            // No scheme specified - return index list
            return res.json({
              amc: amcKey, amcName: AMC_CONFIG[amcKey].name,
              month: found.mon, year: found.year,
              fileUrl: found.url, fileType,
              message: 'Multiple schemes in file. Pass ?scheme= to get holdings for a specific scheme.',
              schemes: xlsxResult.indexMatrix
                .filter(r => r[0] && r[1] && r[0] !== 'INDEX')
                .map(r => ({ code: r[0], name: r[1].split('\n')[0].trim() })),
              totalSheets: xlsxResult.sheetFiles.length,
            });
          }
        }
      } else if (isHTML) {
        matrix = parseHTMLTable(fileBuf);
      } else if (isCFB) {
        const xlsRows = parseXLS(fileBuf);
        matrix = xlsRowsToMatrix(xlsRows);
      }
      if (!matrix.length) {
        return res.status(422).json({
          error: 'Could not parse spreadsheet file - check ?action=debug for diagnostics',
          url: found.url, magic, isZIP, isCFB, isHTML,
          hint: isZIP ? 'XLSX parsed but no rows found for this scheme. Use ?action=schemes&amc=NIPPON to list available schemes.' :
                isCFB ? 'CFB/BIFF8 XLS parsed but no rows found' :
                isHTML ? 'HTML parsed but no table rows found' :
                'Unknown file format',
        });
      }
      holdings = parseHoldingsFromXLS(matrix, scheme || '');
    } else {
      const text = extractTextFromPDF(fileBuf);
      if (!text || text.length < 500) {
        return res.status(422).json({
          error: 'Could not extract text from PDF (may be image-based)',
          url: found.url, textLength: text?.length ?? 0,
        });
      }
      holdings = parseHoldingsFromPDF(text, scheme || '');
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

    return res.json({
      amc: amcKey, amcName: AMC_CONFIG[amcKey].name,
      scheme: scheme || null,
      month: found.mon, year: found.year, monthOffset: found.monthOffset,
      fileUrl: found.url, fileType,
      confidence: AMC_CONFIG[amcKey].confidence,
      holdingsCount: holdings.length, holdings,
      fileSize: fileBuf.length,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 500) });
  }
}
