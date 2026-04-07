// api/nifty-tri.js — TRI data with Vercel Blob caching
// Gap-fetch logic: only queries dates not already cached.
// SETUP: Create Vercel Blob store → BLOB_READ_WRITE_TOKEN auto-added as env var.
//
// GET /api/nifty-tri?index=NIFTY%2050
// GET /api/nifty-tri?index=Nifty%20Midcap%20150&from=01-Jan-2010

const https = require('https');

const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_MAP = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
const CACHE_PRE = 'tri-cache/';

function fmtDate(d){return`${String(d.getDate()).padStart(2,'0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`}
function parseDate(s){const p=s.includes('-')?s.split('-'):s.trim().split(/\s+/);const[dd,mon,yyyy]=p;return new Date(+yyyy,MONTH_MAP[mon]??0,+dd)}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r}
function slugify(n){return n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}

function httpsRequest(options, body){
  return new Promise((resolve,reject)=>{
    const req=https.request(options,res=>{const c=[];res.on('data',ch=>c.push(ch));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(c).toString('utf8')}))});
    req.on('error',reject);req.setTimeout(20000,()=>{req.destroy(new Error('timeout'))});
    if(body)req.write(body);req.end();
  });
}

async function blobGet(slugName){
  try{
    const{list}=require('@vercel/blob');
    const token=process.env.BLOB_READ_WRITE_TOKEN;
    const{blobs}=await list({prefix:`${CACHE_PRE}${slugName}.json`,token,limit:1});
    if(!blobs.length)return null;
    // Private blobs require Authorization header to read
    const r=await fetch(blobs[0].downloadUrl||blobs[0].url,{
      headers:{'Authorization':`Bearer ${token}`,'Cache-Control':'no-store'}
    });
    if(!r.ok)return null;
    return await r.json();
  }catch{return null}
}

async function blobPut(slugName,indexName,data){
  try{
    const{put}=require('@vercel/blob');
    await put(`${CACHE_PRE}${slugName}.json`,JSON.stringify({index:indexName,lastUpdated:new Date().toISOString(),count:data.length,data}),{access:'private',contentType:'application/json',addRandomSuffix:false,token:process.env.BLOB_READ_WRITE_TOKEN});
  }catch(e){console.error('[nifty-tri] BLOB WRITE FAILED — name:',e.name,'msg:',e.message,'status:',e.status||'?','token-present:',!!process.env.BLOB_READ_WRITE_TOKEN)}
}

async function fetchChunk(indexName,startDate,endDate,cookieStr){
  const cinfo=`{'name':'${indexName}','startDate':'${startDate}','endDate':'${endDate}','indexName':'${indexName}'}`;
  const payload=JSON.stringify({cinfo});
  const res=await httpsRequest({hostname:'www.niftyindices.com',path:'/Backpage.aspx/getTotalReturnIndexString',method:'POST',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36','Accept':'application/json, text/javascript, */*; q=0.01','Accept-Language':'en-US,en;q=0.9','Content-Type':'application/json; charset=UTF-8','Content-Length':Buffer.byteLength(payload).toString(),'Referer':'https://www.niftyindices.com/reports/historical-data','Origin':'https://www.niftyindices.com','X-Requested-With':'XMLHttpRequest','Cookie':cookieStr}},payload);
  if(res.status!==200)throw new Error(`HTTP ${res.status}: ${res.body.slice(0,150)}`);
  const outer=JSON.parse(res.body);
  if(!outer.d)throw new Error('No "d" key');
  const rows=JSON.parse(outer.d);
  return Array.isArray(rows)?rows:[];
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function fetchRange(indexName,fromStr,toStr,cookieStr){
  const startD=parseDate(fromStr),endD=parseDate(toStr);
  const chunks=[],seen=new Set();
  let cursor=new Date(startD);
  while(cursor<endD){const end=addDays(cursor,364);chunks.push({from:fmtDate(cursor),to:fmtDate(end>endD?endD:end)});cursor=addDays(end>endD?endD:end,1)}
  const allRows=[],errors=[];let sampleKeys=null;
  for(let i=0;i<chunks.length;i++){
    const chunk=chunks[i];
    try{
      const rows=await fetchChunk(indexName,chunk.from,chunk.to,cookieStr);
      if(rows.length&&!sampleKeys)sampleKeys=Object.keys(rows[0]);
      for(const row of rows){const dk=sampleKeys?.find(k=>/date/i.test(k))||Object.keys(row)[0];const key=row[dk];if(key&&!seen.has(key)){seen.add(key);allRows.push(row)}}
    }catch(e){errors.push(`${chunk.from}→${chunk.to}: ${e.message}`)}
    if(i<chunks.length-1)await sleep(150);
  }
  return{rows:allRows,sampleKeys,errors,chunks:chunks.length};
}

module.exports = async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');

  // Diagnostic endpoint: /api/nifty-tri?health=1
  if(req.query.health){
    const hasToken=!!process.env.BLOB_READ_WRITE_TOKEN;
    let blobStatus='not-tested';
    if(hasToken){
      try{
        const{list}=require('@vercel/blob');
        await list({prefix:'tri-cache/',limit:1,token:process.env.BLOB_READ_WRITE_TOKEN});
        blobStatus='ok';
      }catch(e){blobStatus=`error: ${e.name} - ${e.message}`;}
    }else{blobStatus='BLOB_READ_WRITE_TOKEN not set';}
    return res.status(200).json({hasToken,blobStatus,node:process.version,pkg:'@vercel/blob'});
  }
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');
  if(req.method==='OPTIONS')return res.status(200).end();

  const indexName=req.query.index||'NIFTY 50';
  const slugName=slugify(indexName);
  const defaultFrom=fmtDate(addDays(new Date(),-3650));
  const toStr=req.query.to||fmtDate(new Date());
  const hasBlob=!!process.env.BLOB_READ_WRITE_TOKEN;

  try{
    // Check blob cache FIRST — skip cookie fetch entirely on cache hit
    let cached=null,fromStr=req.query.from||defaultFrom;
    if(hasBlob){
      cached=await blobGet(slugName);
      if(cached?.data?.length){
        const lastDate=cached.data[cached.data.length-1].date;
        const lastTs=parseDate(lastDate);
        // Use -4 days window: covers weekends (Fri cache valid Mon) + public holidays
        const staleCutoff=addDays(new Date(),-4);staleCutoff.setHours(0,0,0,0);
        if(lastTs>=staleCutoff){
          // Cache is fresh — return immediately, no niftyindices.com call needed
          return res.status(200).json({index:indexName,from:cached.data[0].date,to:lastDate,source:'blob-cache',type:'TRI',chunks:0,count:cached.data.length,sampleKeys:['Date','TotalReturnsIndex'],dateKey:'Date',valueKey:'TotalReturnsIndex',oldest:cached.data[0],newest:cached.data[cached.data.length-1],data:cached.data});
        }
        fromStr=fmtDate(addDays(lastTs,1));
      }
    }

    // Acquire cookie (only reached if cache miss or stale)
    const homeRes=await httpsRequest({hostname:'www.niftyindices.com',path:'/',method:'GET',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36','Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'en-US,en;q=0.9'}});
    const setCookieRaw=homeRes.headers['set-cookie']||[];
    const cookieStr=(Array.isArray(setCookieRaw)?setCookieRaw:[setCookieRaw]).map(c=>c.split(';')[0]).join('; ');
    if(!cookieStr)return res.status(502).json({error:'Could not acquire session cookie'});

    // Fetch gap from niftyindices
    const{rows,sampleKeys,errors,chunks}=await fetchRange(indexName,fromStr,toStr,cookieStr);
    if(!rows.length&&!cached?.data?.length)return res.status(404).json({error:'No TRI data returned',index:indexName,errors});

    const keys=sampleKeys||(rows[0]?Object.keys(rows[0]):['Date','TotalReturnsIndex']);
    const dateKey=keys.find(k=>/date/i.test(k))||keys[0];
    const triKey=keys.find(k=>/total|tri|return/i.test(k));
    const valueKey=triKey||keys.find(k=>/close/i.test(k))||keys[keys.length-1];

    const newData=rows.map(r=>({date:r[dateKey],value:parseFloat(r[valueKey])||null})).filter(r=>r.value!==null&&r.date);
    const cachedData=cached?.data||[];
    const seenMerge=new Set(cachedData.map(r=>r.date));
    const merged=[...cachedData,...newData.filter(r=>!seenMerge.has(r.date))].sort((a,b)=>parseDate(a.date)-parseDate(b.date));

    // Fire-and-forget: blob write runs after response is sent
    if(hasBlob&&merged.length)blobPut(slugName,indexName,merged).catch(()=>{});

    return res.status(200).json({index:indexName,from:merged[0]?.date||fromStr,to:merged[merged.length-1]?.date||toStr,source:'niftyindices.com/getTotalReturnIndexString',type:triKey?'TRI':'PRICE',cached:hasBlob,chunks,count:merged.length,sampleKeys:['Date','TotalReturnsIndex'],dateKey:'Date',valueKey:'TotalReturnsIndex',oldest:merged[0],newest:merged[merged.length-1],...(errors.length?{errors}:{}),data:merged});
  }catch(err){
    return res.status(500).json({error:err.message});
  }
};
