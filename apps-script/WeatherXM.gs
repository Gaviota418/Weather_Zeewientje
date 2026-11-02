/**
 * WeatherXM_v05.gs
 * Wijzigingen t.o.v. v04:
 *  - API-key staat in Scripteigenschappen (WXM_KEY) i.p.v. in de code
 *  - windsnelheid 0 geeft nu 0 km/u in plaats van een lege cel
 *  - dezelfde meting wordt niet twee keer gelogd
 *  - cache van de webapp wordt geleegd na nieuwe data
 *  - menu verwijst niet meer naar de ontbrekende showWeatherGraph
 */

const CELL_ID = "87194d545ffffff";

function getOptions_() {
  const key = PropertiesService.getScriptProperties().getProperty("WXM_KEY");
  if (!key) {
    throw new Error(
      "Geen API-key gevonden. Ga naar Projectinstellingen → Scripteigenschappen " +
      "en voeg de eigenschap WXM_KEY toe met je WeatherXM-key."
    );
  }
  return {
    method: "get",
    headers: {
      "X-WXM-PORTAL-API-KEY": key,
      "Accept": "application/json"
    },
    muteHttpExceptions: true
  };
}

const COLUMNS = [
  "record_type",
  "logged_at",
  "source_timestamp",
  "chart_timestamp",
  "forecast_date",
  "timezone",
  "station_name",
  "cell_id",
  "device_id",
  "temperature",
  "feels_like",
  "humidity",
  "pressure",
  "wind_speed",
  "wind_speed_kmh",
  "wind_gust",
  "wind_gust_kmh",
  "wind_direction",
  "precipitation",
  "precipitation_accumulated",
  "precipitation_period",
  "precipitation_probability",
  "uv_index",
  "solar_irradiance",
  "dew_point",
  "icon"
];

function runWeatherXM_Hourly() {
  logWeatherXM_Current();
  buildWeather_Combined();
  buildWeather_ChartData();
  createWeatherCharts();
  clearMeteogramCache_();
}

function runWeatherXM_Daily() {
  updateWeatherXM_HourlyForecast();
  buildWeather_Combined();
  buildWeather_ChartData();
  createWeatherCharts();
  clearMeteogramCache_();
}

function logWeatherXM_Current() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const url = `https://api.weatherxm.com/api/v1/cells/${CELL_ID}/devices`;
  const response = UrlFetchApp.fetch(url, getOptions_());

  if (response.getResponseCode() !== 200) {
    throw new Error(
      "Current weather fout: " +
      response.getResponseCode() +
      " - " +
      response.getContentText()
    );
  }

  const data = JSON.parse(response.getContentText());
  const device = Array.isArray(data) ? data[0] : data;
  const w = device.current_weather || {};

  // Zelfde meting als vorige keer? Dan niets loggen.
  const currentSheet = getOrCreateSheet(ss, "Weather_Current");
  if (w.timestamp && currentSheet.getLastRow() > 1) {
    const col = COLUMNS.indexOf("source_timestamp") + 1;
    const vorige = currentSheet.getRange(currentSheet.getLastRow(), col).getValue();
    const vorigeIso = vorige instanceof Date ? vorige.toISOString() : String(vorige);
    if (vorigeIso === String(w.timestamp) ||
        (vorige instanceof Date && vorige.getTime() === new Date(w.timestamp).getTime())) {
      Logger.log("Geen nieuwe meting sinds " + w.timestamp + ", overgeslagen.");
      return;
    }
  }

  const rainDelta = calculateCurrentRainDelta_(
    ss,
    w.precipitation_accumulated
  );

  const row = {
    record_type: "current",
    logged_at: new Date(),
    source_timestamp: w.timestamp || "",
    chart_timestamp: w.timestamp ? new Date(w.timestamp) : "",
    forecast_date: "",
    timezone: "Europe/Brussels",
    station_name: device.name || "",
    cell_id: CELL_ID,
    device_id: device.id || "",
    temperature: w.temperature ?? "",
    feels_like: w.feels_like ?? "",
    humidity: w.humidity ?? "",
    pressure: w.pressure ?? "",
    wind_speed: w.wind_speed ?? "",
    wind_speed_kmh: w.wind_speed != null ? w.wind_speed * 3.6 : "",
    wind_gust: w.wind_gust ?? "",
    wind_gust_kmh: w.wind_gust != null ? w.wind_gust * 3.6 : "",
    wind_direction: w.wind_direction ?? "",
    precipitation: w.precipitation ?? "",
    precipitation_accumulated: w.precipitation_accumulated ?? "",
    precipitation_period: rainDelta,
    precipitation_probability: "",
    uv_index: w.uv_index ?? "",
    solar_irradiance: w.solar_irradiance ?? "",
    dew_point: w.dew_point ?? "",
    icon: w.icon || ""
  };

  appendStandardRow(currentSheet, row);
}

function updateWeatherXM_HourlyForecast() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const url =
    `https://pro.weatherxm.com/api/v1/cells/${CELL_ID}/forecast?include=daily,hourly`;

  const response = UrlFetchApp.fetch(url, getOptions_());

  if (response.getResponseCode() !== 200) {
    throw new Error(
      "Forecast fout: " +
      response.getResponseCode() +
      " - " +
      response.getContentText()
    );
  }

  const forecastData = JSON.parse(response.getContentText());
  const dailyRaw = Array.isArray(forecastData) ? forecastData : [];

  const rows = [];

  dailyRaw.forEach(day => {
    if (Array.isArray(day.hourly)) {
      day.hourly.forEach(hour => {
        rows.push({
          record_type: "forecast_hourly",
          logged_at: new Date(),
          source_timestamp: hour.timestamp || "",
          chart_timestamp: hour.timestamp ? new Date(hour.timestamp) : "",
          forecast_date: day.date || "",
          timezone: day.tz || "",
          station_name: "",
          cell_id: CELL_ID,
          device_id: "",
          temperature: hour.temperature ?? "",
          feels_like: hour.feels_like ?? "",
          humidity: hour.humidity ?? "",
          pressure: hour.pressure ?? "",
          wind_speed: hour.wind_speed ?? "",
          wind_speed_kmh: hour.wind_speed != null ? hour.wind_speed * 3.6 : "",
          wind_gust: hour.wind_gust ?? "",
          wind_gust_kmh: hour.wind_gust != null ? hour.wind_gust * 3.6 : "",
          wind_direction: hour.wind_direction ?? "",
          precipitation: hour.precipitation ?? "",
          precipitation_accumulated: "",
          precipitation_period: hour.precipitation ?? "",
          precipitation_probability: hour.precipitation_probability ?? "",
          uv_index: hour.uv_index ?? "",
          solar_irradiance: hour.solar_irradiance ?? "",
          dew_point: hour.dew_point ?? "",
          icon: hour.icon || ""
        });
      });
    }
  });

  replaceStandardRows(
    getOrCreateSheet(ss, "Weather_Forecast_Hourly"),
    rows
  );
}

function buildWeather_Combined() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const currentSheet = ss.getSheetByName("Weather_Current");
  const forecastSheet = ss.getSheetByName("Weather_Forecast_Hourly");
  const combinedSheet =
    ss.getSheetByName("Weather_Combined") || ss.insertSheet("Weather_Combined");

  combinedSheet.clear();
  ensureHeaders(combinedSheet);

  const allRows = [];

  if (currentSheet && currentSheet.getLastRow() > 1) {
    allRows.push(...getDataRows_(currentSheet));
  }

  if (forecastSheet && forecastSheet.getLastRow() > 1) {
    allRows.push(...getDataRows_(forecastSheet));
  }

  const chartTimestampIndex = COLUMNS.indexOf("chart_timestamp");

  allRows.sort((a, b) => {
    return new Date(a[chartTimestampIndex]) - new Date(b[chartTimestampIndex]);
  });

  if (allRows.length > 0) {
    combinedSheet
      .getRange(2, 1, allRows.length, COLUMNS.length)
      .setValues(allRows);
  }
}

function buildWeather_ChartData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const combined = ss.getSheetByName("Weather_Combined");
  const chartSheet =
    ss.getSheetByName("Weather_ChartData") || ss.insertSheet("Weather_ChartData");

  chartSheet.clear();

  if (!combined || combined.getLastRow() < 2) {
    chartSheet.getRange(1, 1).setValue("Geen combined data");
    return;
  }

  const data = combined.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const idx = name => headers.indexOf(name);

  const outHeaders = [
    "chart_timestamp",
    "temperature_current",
    "temperature_forecast",
    "humidity_current",
    "humidity_forecast",
    "wind_current_kmh",
    "wind_forecast_kmh",
    "gust_current_kmh",
    "gust_forecast_kmh",
    "precipitation_current",
    "precipitation_forecast",
    "precipitation_probability_forecast"
  ];

  const map = {};

  rows.forEach(r => {
    const type = r[idx("record_type")];
    const ts = r[idx("chart_timestamp")];
    if (!ts) return;

    const key = new Date(ts).toISOString();

    if (!map[key]) {
      map[key] = {
        chart_timestamp: ts,
        temperature_current: "",
        temperature_forecast: "",
        humidity_current: "",
        humidity_forecast: "",
        wind_current_kmh: "",
        wind_forecast_kmh: "",
        gust_current_kmh: "",
        gust_forecast_kmh: "",
        precipitation_current: "",
        precipitation_forecast: "",
        precipitation_probability_forecast: ""
      };
    }

    const target = map[key];

    if (type === "current") {
      target.temperature_current = r[idx("temperature")];
      target.humidity_current = r[idx("humidity")];
      target.wind_current_kmh = r[idx("wind_speed_kmh")];
      target.gust_current_kmh = r[idx("wind_gust_kmh")];
      target.precipitation_current = r[idx("precipitation_period")];
    }

    if (type === "forecast_hourly") {
      target.temperature_forecast = r[idx("temperature")];
      target.humidity_forecast = r[idx("humidity")];
      target.wind_forecast_kmh = r[idx("wind_speed_kmh")];
      target.gust_forecast_kmh = r[idx("wind_gust_kmh")];
      target.precipitation_forecast = r[idx("precipitation_period")];
      target.precipitation_probability_forecast =
        r[idx("precipitation_probability")];
    }
  });

  const outRows = Object.values(map).sort(
    (a, b) => new Date(a.chart_timestamp) - new Date(b.chart_timestamp)
  );

  chartSheet
    .getRange(1, 1, 1, outHeaders.length)
    .setValues([outHeaders]);

  if (outRows.length > 0) {
    chartSheet
      .getRange(2, 1, outRows.length, outHeaders.length)
      .setValues(outRows.map(o => outHeaders.map(h => o[h])));
  }
}

function createWeatherCharts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Weather_ChartData");
  const dashboard =
    ss.getSheetByName("Dashboard") || ss.insertSheet("Dashboard");

  dashboard.clear();
  dashboard.getCharts().forEach(chart => dashboard.removeChart(chart));

  dashboard.getRange("A1").setValue("WeatherXM Wijngaard Dashboard");

  if (!sheet || sheet.getLastRow() < 2) {
    dashboard.getRange("A3").setValue("Nog geen chartdata beschikbaar.");
    return;
  }

  createLineChart_(dashboard, sheet, "Temperatuur current vs forecast", 2, 1, [
    "chart_timestamp",
    "temperature_current",
    "temperature_forecast"
  ]);

  createLineChart_(dashboard, sheet, "Luchtvochtigheid current vs forecast", 18, 1, [
    "chart_timestamp",
    "humidity_current",
    "humidity_forecast"
  ]);

  createLineChart_(dashboard, sheet, "Wind current vs forecast", 34, 1, [
    "chart_timestamp",
    "wind_current_kmh",
    "wind_forecast_kmh",
    "gust_current_kmh",
    "gust_forecast_kmh"
  ]);

  createLineChart_(dashboard, sheet, "Neerslag current vs forecast", 50, 1, [
    "chart_timestamp",
    "precipitation_current",
    "precipitation_forecast",
    "precipitation_probability_forecast"
  ]);
}


// HELPERS

function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureHeaders(sheet) {
  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
}

function appendStandardRow(sheet, rowObj) {
  if (sheet.getLastRow() === 0) {
    ensureHeaders(sheet);
  }

  const values = COLUMNS.map(c => rowObj[c] ?? "");

  sheet
    .getRange(sheet.getLastRow() + 1, 1, 1, COLUMNS.length)
    .setValues([values]);
}

function replaceStandardRows(sheet, rows) {
  sheet.clear();
  ensureHeaders(sheet);

  if (!rows || rows.length === 0) return;

  const values = rows.map(rowObj =>
    COLUMNS.map(c => rowObj[c] ?? "")
  );

  sheet
    .getRange(2, 1, values.length, COLUMNS.length)
    .setValues(values);
}

function getDataRows_(sheet) {
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return [];
  }

  const sheetHeaders = data[0];
  const rows = data.slice(1);

  return rows.map(row => {
    return COLUMNS.map(colName => {
      const index = sheetHeaders.indexOf(colName);
      return index >= 0 ? row[index] : "";
    });
  });
}

function calculateCurrentRainDelta_(ss, currentAccumulated) {
  if (
    currentAccumulated === "" ||
    currentAccumulated === null ||
    currentAccumulated === undefined
  ) {
    return "";
  }

  const sheet = ss.getSheetByName("Weather_Current");

  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }

  const headers =
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const col = headers.indexOf("precipitation_accumulated") + 1;

  if (col <= 0) return "";

  const previous = sheet.getRange(sheet.getLastRow(), col).getValue();

  if (previous === "" || previous === null || previous === undefined) {
    return 0;
  }

  const diff = Number(currentAccumulated) - Number(previous);

  if (diff < 0) {
    return Number(currentAccumulated);
  }

  return diff;
}

function createLineChart_(dashboard, sheet, title, row, col, columnNames) {
  const headers =
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const lastRow = sheet.getLastRow();

  let chart = dashboard.newChart()
    .setChartType(Charts.ChartType.LINE)
    .setOption("title", title)
    .setOption("legend", { position: "bottom" })
    .setOption("hAxis", { title: "Tijd" })
    .setPosition(row, col, 0, 0);

  columnNames.forEach(name => {
    const c = headers.indexOf(name) + 1;
    if (c > 0) {
      chart = chart.addRange(sheet.getRange(1, c, lastRow, 1));
    }
  });

  dashboard.insertChart(chart.build());
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("WeatherXM")
    .addItem("Nu verversen (meting)", "runWeatherXM_Hourly")
    .addItem("Verwachting verversen", "runWeatherXM_Daily")
    .addToUi();
}

/** Eenmalig uitvoeren: zet de uur- en dagtriggers (bestaande worden eerst verwijderd). */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => ["runWeatherXM_Hourly", "runWeatherXM_Daily"].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("runWeatherXM_Hourly").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("runWeatherXM_Daily").timeBased().atHour(4).everyDays(1).inTimezone("Europe/Brussels").create();
}

function authorizeWeatherXM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Weather_Combined");
  const values = sheet.getDataRange().getValues();
  Logger.log(values.length);
}

function testAuthorizationWeatherXM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Weather_Combined");

  if (!sheet) {
    throw new Error("Weather_Combined niet gevonden");
  }

  const values = sheet.getRange(1, 1, 5, 5).getValues();
  Logger.log(values);
}
