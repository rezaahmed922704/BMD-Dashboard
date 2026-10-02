/*
 * Local preview shim for Index.html
 * Lets the Apps Script dashboard run in a normal browser by emulating
 * google.script.run and serving data from the local CSV export.
 */
(function () {
  'use strict';

  var CSV_URL = './AIL-Trade Data-2023-2026-new.csv';
  var CSV_URL_FALLBACK = '../../AIL-Trade Data-2023-2026-new.csv';
  var CSV_FILE = 'AIL-Trade Data-2023-2026-new.csv';
  var UPLOAD_URL = '/__upload';
  var GEOJSON_URL = 'bangladesh-districts.geojson';
  var GEOJSON_REMOTE = 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_BGD_2.json';
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var cache = { text: null, rows: null };
  var hosted = location.hostname.endsWith('.vercel.app');
  var databasePromise = null;
  window.dashboardCsvStorage = hosted ? 'browser' : 'server';

  function uploadDatabase() {
    if (databasePromise) { return databasePromise; }
    databasePromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Browser storage is not available for CSV uploads.')); return; }
      var request = indexedDB.open('bmd-dashboard-csv', 1);
      request.onupgradeneeded = function () { request.result.createObjectStore('uploads'); };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
    return databasePromise;
  }

  function savedRows() {
    return uploadDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction('uploads', 'readonly').objectStore('uploads').get('current');
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function storeRows(rows) {
    return uploadDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction('uploads', 'readwrite');
        transaction.objectStore('uploads').put({ rows: rows, updatedAt: new Date().toISOString() }, 'current');
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error); };
      });
    });
  }

  function clearSavedRows() {
    return uploadDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction('uploads', 'readwrite');
        transaction.objectStore('uploads').delete('current');
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error); };
      });
    });
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var value = '';
    var quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; }
        } else { value += ch; }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(value); value = '';
      } else if (ch === '\n') {
        row.push(value); rows.push(row); row = []; value = '';
      } else if (ch !== '\r') {
        value += ch;
      }
    }
    if (value.length || row.length) { row.push(value); rows.push(row); }
    return rows;
  }

  function headerIndex(headers, names) {
    var normalized = headers.map(function (h) { return String(h).toLowerCase().replace(/\s+/g, ''); });
    for (var n = 0; n < names.length; n++) {
      var idx = normalized.indexOf(names[n].toLowerCase().replace(/\s+/g, ''));
      if (idx > -1) { return idx; }
    }
    return -1;
  }

  function toNumber(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text || text === '-' || text === '#N/A') { return 0; }
    var num = Number(text.replace(/\s*MT$/i, '').replace(/,/g, ''));
    return isFinite(num) ? num : 0;
  }

  function toMonth(value) {
    if (typeof value === 'number') { return value; }
    var text = String(value == null ? '' : value).trim();
    var numeric = Number(text);
    if (numeric) { return numeric; }
    var idx = MONTH_NAMES.map(function (m) { return m.toLowerCase(); }).indexOf(text.slice(0, 3).toLowerCase());
    return idx > -1 ? idx + 1 : 0;
  }

  function loadRows() {
    if (hosted) {
      return savedRows().catch(function () { return null; }).then(function (saved) {
        if (saved && Array.isArray(saved.rows)) { return saved.rows; }
        return loadBundledRows();
      });
    }
    return loadBundledRows();
  }

  function loadBundledRows() {
    return fetch(CSV_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) { throw new Error('Could not load local CSV (' + response.status + ').'); }
        return response.text();
      })
      .catch(function () {
        return fetch(CSV_URL_FALLBACK + '?t=' + Date.now(), { cache: 'no-store' }).then(function (response) {
          if (!response.ok) { throw new Error('Could not load CSV (' + response.status + ').'); }
          return response.text();
        });
      })
      .then(function (text) {
        if (!text || !text.trim()) { throw new Error('The CSV file is empty: ' + CSV_URL); }
        if (text !== cache.text) {
          cache.text = text;
          cache.rows = buildRows(text);
          cache.loadedAt = new Date();
        }
        return cache.rows;
      });
  }

  function normalizeZone(value) {
    var zone = String(value == null ? '' : value).trim();
    return !zone || zone === '#N/A' ? 'Unassigned Zone' : zone;
  }

  function buildRows(text) {
    var table = parseCsv(String(text || '').replace(/^\uFEFF/, ''));
    var headers = (table[0] || []).map(function (h) { return String(h).trim(); });
    var dateIndex = headerIndex(headers, ['Date', 'Sales Date', 'Invoice Date']);
    var yearIndex = headerIndex(headers, ['Year', 'Fiscal Year']);
    var monthIndex = headerIndex(headers, ['Month', 'Month Name']);
    var zoneIndex = headerIndex(headers, ['Zone', 'Sales Zone', 'Region']);
    var districtIndex = headerIndex(headers, ['Districts', 'District', 'District Name']);
    var dealerIndex = headerIndex(headers, ['Clients', 'Client', 'Dealer', 'Dealer Name', 'Distributor']);
    var salesIndex = headerIndex(headers, ['MT', 'Sales', 'Sale', 'Amount', 'Sales Amount', 'values']);

    if (districtIndex === -1 || salesIndex === -1) {
      throw new Error('CSV must contain District and a sales column (MT).');
    }

    var rows = [];
    for (var r = 1; r < table.length; r++) {
      var line = table[r];
      if (!line.length || !String(line[districtIndex] || '').trim()) { continue; }
      var date = dateIndex > -1 ? new Date(line[dateIndex]) : null;
      var year = yearIndex > -1 ? Number(line[yearIndex]) : 0;
      if (!year && date && !isNaN(date)) { year = date.getFullYear(); }
      var month = monthIndex > -1 ? toMonth(line[monthIndex]) : (date && !isNaN(date) ? date.getMonth() + 1 : 0);
      if (!year || !month) { continue; }
      rows.push({
        district: String(line[districtIndex] || '').trim(),
        zone: zoneIndex > -1 ? normalizeZone(line[zoneIndex]) : 'All Zones',
        dealer: dealerIndex > -1 ? (String(line[dealerIndex] || '').trim() || 'Unknown Dealer') : 'All Dealers',
        sales: toNumber(line[salesIndex]),
        year: year,
        month: month,
        monthName: MONTH_NAMES[month - 1] || ''
      });
    }
    return rows;
  }

  var handlers = {
    getDashboardData: function () {
      return loadRows().then(function (rows) {
        var years = Array.from(new Set(rows.map(function (r) { return r.year; }))).sort(function (a, b) { return a - b; });
        var defaultYear = years[years.length - 1] || new Date().getFullYear();
        var monthValues = rows.filter(function (r) { return r.year === defaultYear; }).map(function (r) { return r.month; });
        return {
          updatedAt: new Date().toISOString(),
          rows: rows,
          years: years,
          months: MONTH_NAMES.map(function (label, i) { return { value: i + 1, label: label }; }),
          defaultYear: defaultYear,
          defaultMonth: monthValues.length ? Math.max.apply(null, monthValues) : new Date().getMonth() + 1
        };
      });
    },
    getDistrictGeoJson: function () {
      return fetch(GEOJSON_URL).then(function (response) {
        if (!response.ok) { throw new Error('Local map file missing. Download ' + GEOJSON_REMOTE + ' as ' + GEOJSON_URL); }
        return response.json();
      });
    },
    setupDemoData: function () { return Promise.resolve(null); },
    importCsvData: function (text, replaceData) {
      var content = String(text || '');
      if (!content.trim()) {
        return Promise.reject(new Error('CSV data is empty. Pick a CSV file or paste CSV text first.'));
      }
      // Parse with the same reader the dashboard uses, so a file that cannot be
      // read never overwrites the existing data.
      var parsed;
      try {
        parsed = buildRows(content);
      } catch (error) {
        return Promise.reject(error);
      }
      if (!parsed.length) {
        return Promise.reject(new Error('No data rows with a district name were found in the uploaded CSV.'));
      }
      if (hosted) {
        return (replaceData ? Promise.resolve([]) : loadRows()).then(function (existing) {
          var rows = existing.concat(parsed);
          return storeRows(rows).then(function () {
            cache.text = null;
            cache.rows = rows;
            return { importedRows: parsed.length, totalRows: rows.length, parsedRows: parsed.length, storage: 'browser' };
          });
        });
      }
      var url = UPLOAD_URL + '?file=' + encodeURIComponent(CSV_FILE) +
        '&mode=' + (replaceData ? 'replace' : 'append') + '&t=' + Date.now();
      return fetch(url, { method: 'POST', body: content, cache: 'no-store' })
        .then(function (response) {
          var contentType = String(response.headers.get('content-type') || '');
          if (!response.ok || contentType.indexOf('application/json') === -1) {
            if (response.status === 404 || response.status === 405 || response.status === 501) {
              throw new Error('CSV upload is only available on the local dashboard server. ' +
                'Start it with start-dashboard.cmd, then upload again. ' +
                '(Server returned ' + response.status + ' for ' + UPLOAD_URL + '.)');
            }
            throw new Error('Upload failed (' + response.status + ').');
          }
          return response.json().then(function (payload) {
            if (!payload.ok) {
              throw new Error(payload && payload.error ? payload.error : 'Upload failed (' + response.status + ').');
            }
            return payload;
          });
        })
        .then(function (payload) {
          cache.text = null;
          cache.rows = null;
          return {
            importedRows: payload.importedRows,
            totalRows: payload.totalRows,
            parsedRows: parsed.length,
            backup: payload.backup
          };
        });
    },
    resetCsvData: function () {
      if (!hosted) { return Promise.reject(new Error('Browser CSV storage is only used on the hosted dashboard.')); }
      return clearSavedRows();
    }
  };

  function createRunner(success, failure) {
    var runner = {
      withSuccessHandler: function (fn) { success = fn; return runner; },
      withFailureHandler: function (fn) { failure = fn; return runner; },
      withUserObject: function () { return runner; }
    };
    Object.keys(handlers).forEach(function (name) {
      runner[name] = function () {
        var args = arguments;
        Promise.resolve()
          .then(function () { return handlers[name].apply(null, args); })
          .then(function (result) { if (success) { success(result); } })
          .catch(function (error) {
            console.error('[preview shim]', name, error);
            if (failure) { failure(error); }
          });
        return runner;
      };
    });
    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', {
    configurable: true,
    get: function () { return createRunner(null, null); }
  });
  console.log('[preview shim] google.script.run ready, CSV:', CSV_URL);
})();
