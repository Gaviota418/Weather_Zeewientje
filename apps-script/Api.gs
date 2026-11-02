/**
 * Api.gs – serveert de meteogram-webapp en de data.
 *
 *  /exec                → de app zelf (Index.html)
 *  /exec?format=json    → data als JSON
 *       &van=ISO&tot=ISO   optioneel tijdvenster (standaard: -24 u tot +48 u)
 */

const API_FIELDS = [
  "record_type", "source_timestamp", "chart_timestamp",
  "temperature", "dew_point", "humidity",
  "precipitation_period", "precipitation_probability",
  "wind_speed", "wind_speed_kmh", "wind_gust", "wind_gust_kmh", "wind_direction",
  "solar_irradiance", "uv_index", "icon", "pressure"
];

function doGet(e) {
  const p = (e && e.parameter) || {};

  if (p.format === "json" || (e && e.pathInfo === "json")) {
    let body;
    try {
      body = getMeteogramData(p.van, p.tot);
    } catch (err) {
      body = { error: String(err && err.message || err) };
    }
    return ContentService
      .createTextOutput(JSON.stringify(body))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // De app krijgt zijn eigen /exec-link mee, zodat hij de data rechtstreeks kan ophalen.
  let url = "";
  try { url = ScriptApp.getService().getUrl() || ""; } catch (err) {}
  const t = HtmlService.createTemplateFromFile("Index");
  t.apiUrl = url;

  return t.evaluate()
    .setTitle("Meteogram Wijngaard")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Wordt ook rechtstreeks aangeroepen door de app via google.script.run */
function getMeteogramData(vanIso, totIso) {
  const nu = Date.now();
  const van = vanIso ? new Date(vanIso) : new Date(nu - 24 * 3600e3);
  const tot = totIso ? new Date(totIso) : new Date(nu + 48 * 3600e3);

  const cache = CacheService.getScriptCache();
  const cacheKey = "mg_" + Math.floor(van.getTime() / 6e5) + "_" + Math.floor(tot.getTime() / 6e5);
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Weather_Combined");
  if (!sh || sh.getLastRow() < 2) {
    return { bijgewerkt: new Date().toISOString(), station: "", laatste: null, data: [] };
  }

  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));

  const tijd = r => {
    const s = r[idx.source_timestamp];
    const d = s ? new Date(s) : new Date(r[idx.chart_timestamp]);
    return d;
  };
  const schoon = v => (v instanceof Date ? v.toISOString() : v === "" ? null : v);
  const naarObject = r => {
    const o = {};
    API_FIELDS.forEach(f => (o[f] = idx[f] === undefined ? null : schoon(r[idx[f]])));
    if (!o.source_timestamp) o.source_timestamp = tijd(r).toISOString();
    return o;
  };

  const data = [];
  let laatste = null;
  let station = "";
  const vandaag = Utilities.formatDate(new Date(), "Europe/Brussels", "yyyy-MM-dd");
  let regenVandaag = 0;
  /* dagwaarden van de laatste 35 dagen (voor de waterbalans): min/max temperatuur en regen */
  const sinds = new Date(nu - 35 * 24 * 3600e3);
  const dagen = {};
  /* metingen per uur (laatste 31 dagen) om met de gearchiveerde verwachting te vergelijken */
  const gemetenPerUur = {};

  values.forEach(r => {
    const t = tijd(r);
    if (isNaN(t)) return;
    const isCurrent = r[idx.record_type] === "current";

    if (isCurrent) {
      if (!laatste || t > new Date(laatste.source_timestamp)) laatste = naarObject(r);
      if (idx.station_name !== undefined && r[idx.station_name]) station = r[idx.station_name];
      const dag = Utilities.formatDate(t, "Europe/Brussels", "yyyy-MM-dd");
      if (dag === vandaag) {
        regenVandaag += Number(r[idx.precipitation_period]) || 0;
      }
      if (t >= sinds) {
        const uur = Math.round(t.getTime() / 3600e3);
        if (!gemetenPerUur[uur]) gemetenPerUur[uur] = {
          T: r[idx.temperature] === "" ? null : Number(r[idx.temperature]),
          P: r[idx.precipitation_period] === "" ? null : Number(r[idx.precipitation_period]),
          W: r[idx.wind_speed_kmh] === "" ? null : Number(r[idx.wind_speed_kmh])
        };
        const T = Number(r[idx.temperature]);
        const d = dagen[dag] || (dagen[dag] = { dag: dag, tmin: null, tmax: null, regen: 0, n: 0 });
        if (r[idx.temperature] !== "" && !isNaN(T)) {
          d.tmin = d.tmin == null ? T : Math.min(d.tmin, T);
          d.tmax = d.tmax == null ? T : Math.max(d.tmax, T);
          d.n++;
        }
        d.regen += Number(r[idx.precipitation_period]) || 0;
      }
    }
    if (t >= van && t <= tot) data.push(naarObject(r));
  });

  const loc = stationLocation_();
  const result = {
    bijgewerkt: new Date().toISOString(),
    lat: loc ? loc.lat : null,
    lon: loc ? loc.lon : null,
    station: station,
    van: van.toISOString(),
    tot: tot.toISOString(),
    regen_vandaag: Math.round(regenVandaag * 10) / 10,
    laatste: laatste,
    dagen: Object.keys(dagen).sort().map(k => dagen[k]),
    vergelijking: forecastPairs_(gemetenPerUur, nu),
    data: data
  };

  try { cache.put(cacheKey, JSON.stringify(result), 600); } catch (err) { /* te groot voor cache: geen probleem */ }
  return result;
}

/** Leeg de cache na een nieuwe meting, zodat de app meteen de nieuwste data toont. */
function clearMeteogramCache_() {
  // CacheService kan niet op patroon wissen; we wissen de sleutels van het standaardvenster.
  const nu = Date.now();
  const keys = [];
  for (let off = -1; off <= 1; off++) {
    const base = Math.floor(nu / 3600e3) * 3600e3 + off * 3600e3;
    keys.push("mg_" + Math.floor((base - 24 * 3600e3) / 6e5) + "_" + Math.floor((base + 48 * 3600e3) / 6e5));
  }
  CacheService.getScriptCache().removeAll(keys);
}

/** Voegt een deelbestand (Css, Js1, Js2, Js3) letterlijk in Index in. */
function include(naam) {
  return HtmlService.createHtmlOutputFromFile(naam).getContent();
}

/** Coördinaten van het station (voor zonsopgang/-ondergang). Eén keer opgehaald en bewaard in
 *  Scripteigenschappen STATION_LAT / STATION_LON. Je kunt ze daar ook zelf invullen. */
function stationLocation_() {
  const props = PropertiesService.getScriptProperties();
  const lat = props.getProperty("STATION_LAT"), lon = props.getProperty("STATION_LON");
  if (lat && lon) return { lat: Number(lat), lon: Number(lon) };
  try {
    const res = UrlFetchApp.fetch("https://api.weatherxm.com/api/v1/cells/" + CELL_ID + "/devices", getOptions_());
    if (res.getResponseCode() !== 200) return null;
    const data = JSON.parse(res.getContentText());
    const dev = Array.isArray(data) ? data[0] : data;
    const loc = (dev && (dev.location || dev.geometry || dev.coordinates)) || dev || {};
    const la = loc.lat != null ? loc.lat : loc.latitude;
    const lo = loc.lon != null ? loc.lon : (loc.lng != null ? loc.lng : loc.longitude);
    if (la == null || lo == null) return null;
    props.setProperties({ STATION_LAT: String(la), STATION_LON: String(lo) });
    return { lat: Number(la), lon: Number(lo) };
  } catch (err) {
    return null;
  }
}

/** Paren [tijd, verwachte T, gemeten T, verwachte regen, gemeten regen, verwachte wind, gemeten wind]
 *  voor elk gearchiveerd uur van de laatste 30 dagen waarvan ook een meting bestaat. */
function forecastPairs_(gemeten, nu) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Verwachting_archief");
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  const van = nu - 30 * 24 * 3600e3, out = [];
  const num = x => (x === "" || x === null || isNaN(Number(x))) ? null : Math.round(Number(x) * 10) / 10;
  v.forEach(r => {
    const t = new Date(r[2]).getTime();
    if (isNaN(t) || t < van || t > nu) return;
    const m = gemeten[Math.round(t / 3600e3)];
    if (!m) return;
    out.push([new Date(t).toISOString(), num(r[3]), num(m.T), num(r[5]), num(m.P), num(r[7]), num(m.W)]);
  });
  return out;
}
