/**
 * public/js/logo-resolver.js
 *
 * Plain-JS port of lib/providerLogos.js's matching logic, for the
 * homepage calculator suite (mfcalc-main.js), which loads as a plain
 * <script> tag and can't import an ES module. Fetches the same data
 * lib/providerLogos.js uses (via /api/logo-map, a thin re-export of
 * lib/logoMap.json + SIF_OVERRIDES) so there's one source of truth.
 *
 * Exposes window.LogoResolver = { getMFLogo, getSIFLogo, getMFLogoFromSchemeName }.
 * All three return null (not a placeholder) until the fetch resolves or
 * on a miss — callers should treat a null return as "no logo available".
 */
(function () {
  var mfMap = {};
  var pmsMap = {};
  var sifMap = {};
  var mfEntriesByStrippedLengthDesc = [];
  var loaded = false;

  function normalise(name) {
    return (name || '').trim().toLowerCase();
  }

  var AMC_STRIP_RE = /\s+(asset management company( limited\.?)?|amc|mutual fund)\s*$/i;

  function fuzzyMFLookup(name) {
    var n = normalise(name);
    var firstWord = n.split(/\s+/)[0];
    if (firstWord.length < 3) return null;
    for (var k in mfMap) {
      if (k.indexOf(firstWord + ' ') === 0) return mfMap[k];
    }
    return null;
  }

  function getMFLogo(fundHouseName) {
    if (!fundHouseName) return null;
    var n = normalise(fundHouseName);
    if (mfMap[n]) return mfMap[n];
    var stripped = n.replace(AMC_STRIP_RE, '').trim();
    var withMF = stripped + ' mutual fund';
    if (mfMap[withMF]) return mfMap[withMF];
    if (mfMap[stripped]) return mfMap[stripped];
    return fuzzyMFLookup(n);
  }

  function getSIFLogo(sifHouseName) {
    if (!sifHouseName) return null;
    var n = normalise(sifHouseName);
    return sifMap[n] || null;
  }

  function getMFLogoFromSchemeName(schemeName) {
    if (!schemeName) return null;
    var n = normalise(schemeName);
    for (var i = 0; i < mfEntriesByStrippedLengthDesc.length; i++) {
      var pair = mfEntriesByStrippedLengthDesc[i];
      if (n.indexOf(pair[0]) === 0) return pair[1];
    }
    var firstWord = n.split(/[\s-]/)[0];
    for (var k in mfMap) {
      if (k.indexOf(firstWord + ' ') === 0) return mfMap[k];
    }
    return null;
  }

  function buildIndexes(data) {
    mfMap = data.mf || {};
    pmsMap = data.pms || {};
    sifMap = data.sif || {};
    mfEntriesByStrippedLengthDesc = [];
    for (var k in mfMap) {
      mfEntriesByStrippedLengthDesc.push([k.replace(/ mutual fund$/, ''), mfMap[k]]);
    }
    mfEntriesByStrippedLengthDesc.sort(function (a, b) { return b[0].length - a[0].length; });
    loaded = true;
  }

  var ready = fetch('/api/logo-map')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { if (data) buildIndexes(data); })
    .catch(function () { /* non-fatal — logos just won't resolve */ });

  window.LogoResolver = {
    ready: ready,
    isLoaded: function () { return loaded; },
    getMFLogo: getMFLogo,
    getSIFLogo: getSIFLogo,
    getMFLogoFromSchemeName: getMFLogoFromSchemeName,
  };
})();
