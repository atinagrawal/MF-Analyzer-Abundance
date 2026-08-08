const https = require('https');

https.get('https://www.amfiindia.com/api/populate-mf', res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const data = JSON.parse(body);
    console.log("All AMC IDs:", JSON.stringify(data.map(d => d.mfId).filter(Boolean)));
  });
});
