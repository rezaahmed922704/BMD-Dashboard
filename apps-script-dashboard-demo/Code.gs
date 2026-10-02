var SHEET_NAME = 'SalesData';
var DISTRICT_GEOJSON_URL = 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_BGD_2.json';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Sales Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dashboard')
    .addItem('Setup demo data', 'setupDemoData')
    .addToUi();
}

function getDashboardData() {
  const sheet = getOrCreateSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    setupDemoData();
    return getDashboardData();
  }

  const headers = values[0].map(header => String(header).trim());
  const districtIndex = findHeaderIndex_(headers, ['Districts', 'District', 'District Name']);
  const salesIndex = findHeaderIndex_(headers, ['Sales', 'Sale', 'Amount', 'Sales Amount']);
  const zoneIndex = findHeaderIndex_(headers, ['Zone', 'Sales Zone', 'Region']);
  const dealerIndex = findHeaderIndex_(headers, ['Dealer', 'Dealer Name', 'Distributor']);
  const yearIndex = findHeaderIndex_(headers, ['Year', 'Fiscal Year']);
  const monthIndex = findHeaderIndex_(headers, ['Month', 'Month Name']);
  const dateIndex = findHeaderIndex_(headers, ['Date', 'Sales Date', 'Invoice Date']);

  if (districtIndex === -1 || salesIndex === -1) {
    throw new Error('SalesData sheet must have Districts and Sales columns. Optional: Date, Year, Month, Zone, Dealer.');
  }

  const rows = values.slice(1).map(row => normalizeRow_(row, districtIndex, salesIndex, zoneIndex, dealerIndex, yearIndex, monthIndex, dateIndex))
    .filter(row => row.district && row.year && row.month);

  const years = [...new Set(rows.map(row => row.year))].sort((a, b) => a - b);
  const months = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: monthName_(index + 1) }));

  return {
    updatedAt: new Date().toISOString(),
    rows,
    years,
    months,
    defaultYear: years[years.length - 1] || new Date().getFullYear(),
    defaultMonth: getDefaultMonth_(rows, years)
  };
}

function getDistrictGeoJson() {
  const response = UrlFetchApp.fetch(DISTRICT_GEOJSON_URL, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('Bangladesh district map source is not available.');
  }
  return JSON.parse(response.getContentText());
}



function setupDemoData() {
  const sheet = getOrCreateSheet_();
  const headers = ['Date', 'Year', 'Month', 'Zone', 'Districts', 'Dealer', 'Sales'];
  const demoRows = getDemoRows_();

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, demoRows.length, headers.length).setValues(demoRows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function importCsvData(csvText, replaceData) {
  if (!csvText || !String(csvText).trim()) {
    throw new Error('CSV data is empty. Pick a CSV file or paste CSV text into the box, then click Upload To Sheet again.');
  }

  const rows = Utilities.parseCsv(String(csvText)).filter(row => row.some(cell => String(cell || '').trim() !== ''));
  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headers = rows[0].map(header => String(header || '').trim());
  const dateIndex = findHeaderIndex_(headers, ['Date', 'Sales Date', 'Invoice Date']);
  const yearIndex = findHeaderIndex_(headers, ['Year', 'Fiscal Year']);
  const monthIndex = findHeaderIndex_(headers, ['Month', 'Month Name']);
  const zoneIndex = findHeaderIndex_(headers, ['Zone', 'Sales Zone', 'Region']);
  const districtIndex = findHeaderIndex_(headers, ['Districts', 'District', 'District Name']);
  const dealerIndex = findHeaderIndex_(headers, ['Clients', 'Client', 'Dealer', 'Dealer Name', 'Distributor']);
  const salesIndex = findHeaderIndex_(headers, ['Sales', 'MT', 'Sale', 'Amount', 'Sales Amount', 'values']);

  const missing = [];
  if (districtIndex === -1) missing.push('District (or Districts)');
  if (salesIndex === -1) missing.push('Sales (or MT / Amount)');
  if (missing.length) {
    const found = headers.filter(Boolean).join(', ') || '(none)';
    throw new Error('Missing required CSV columns: ' + missing.join(', ') + '. Headers found: ' + found);
  }

  const outHeaders = ['Date', 'Year', 'Month', 'Zone', 'Districts', 'Dealer', 'Sales'];
  const normalized = rows.slice(1)
    .map(row => [
      dateIndex > -1 ? String(row[dateIndex] || '').trim() : '',
      yearIndex > -1 ? String(row[yearIndex] || '').trim() : '',
      monthIndex > -1 ? String(row[monthIndex] || '').trim() : '',
      zoneIndex > -1 ? normalizeZone_(row[zoneIndex]) : 'All Zones',
      districtIndex > -1 ? String(row[districtIndex] || '').trim() : '',
      dealerIndex > -1 ? String(row[dealerIndex] || '').trim() || 'Unknown Dealer' : 'All Dealers',
      salesIndex > -1 ? parseSales_(row[salesIndex]) : 0
    ])
    .filter(row => row[4]);

  if (!normalized.length) {
    throw new Error('No data rows with a district name were found.');
  }

  const sheet = getOrCreateSheet_();
  const shouldWriteHeaders = replaceData || sheet.getLastRow() === 0;
  const startRow = shouldWriteHeaders ? 1 : sheet.getLastRow() + 1;
  const values = shouldWriteHeaders ? [outHeaders].concat(normalized) : normalized;

  if (replaceData) sheet.clear();
  writeRowsInChunks_(sheet, startRow, values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, outHeaders.length);

  return {
    importedRows: normalized.length,
    totalRows: Math.max(sheet.getLastRow() - 1, 0)
  };
}

function writeRowsInChunks_(sheet, startRow, rows) {
  const chunkSize = 2000;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    sheet.getRange(startRow + index, 1, chunk.length, chunk[0].length).setValues(chunk);
  }
}

function getOrCreateSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function normalizeRow_(row, districtIndex, salesIndex, zoneIndex, dealerIndex, yearIndex, monthIndex, dateIndex) {
  const date = dateIndex > -1 ? parseDate_(row[dateIndex]) : null;
  const inputYear = yearIndex > -1 ? Number(row[yearIndex]) : 0;
  const year = inputYear || (date ? date.getFullYear() : 0);
  const month = monthIndex > -1 ? parseMonth_(row[monthIndex]) : date ? date.getMonth() + 1 : 0;

  return {
    district: String(row[districtIndex] || '').trim(),
    zone: zoneIndex > -1 ? normalizeZone_(row[zoneIndex]) : 'All Zones',
    dealer: dealerIndex > -1 ? String(row[dealerIndex] || '').trim() || 'Unknown Dealer' : 'All Dealers',
    sales: parseSales_(row[salesIndex]),
    year,
    month,
    monthName: monthName_(month)
  };
}

function normalizeZone_(value) {
  const zone = String(value || '').trim();
  return !zone || zone === '#N/A' ? 'Unassigned Zone' : zone;
}

function parseSales_(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text === '-' || text === '#N/A') return 0;
  const sales = Number(text.replace(/\s*MT$/i, '').replace(/,/g, ''));
  return isFinite(sales) ? sales : 0;
}

function findHeaderIndex_(headers, names) {
  const normalized = headers.map(header => header.toLowerCase().replace(/\s+/g, ''));
  return names.map(name => name.toLowerCase().replace(/\s+/g, '')).reduce((match, name) => {
    return match > -1 ? match : normalized.indexOf(name);
  }, -1);
}

function parseDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return value;
  const parsed = new Date(value);
  return isNaN(parsed) ? null : parsed;
}

function parseMonth_(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '').trim();
  const numeric = Number(text);
  if (numeric) return numeric;
  const index = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(text.slice(0, 3).toLowerCase());
  return index > -1 ? index + 1 : 0;
}

function monthName_(month) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] || '';
}

function getDefaultMonth_(rows, years) {
  const defaultYear = years[years.length - 1];
  const months = rows.filter(row => row.year === defaultYear).map(row => row.month);
  return Math.max.apply(null, months.length ? months : [new Date().getMonth() + 1]);
}

function getDemoRows_() {
  const districts = ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur', 'Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', 'Cumilla', 'Coxs Bazar', 'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati', 'Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail', 'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira', 'Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur', 'Bogura', 'Joypurhat', 'Naogaon', 'Natore', 'Chapainawabganj', 'Pabna', 'Rajshahi', 'Sirajganj', 'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Rangpur', 'Thakurgaon', 'Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'];
  const dealers = ['Dealer A', 'Dealer B', 'Dealer C'];
  const zones = ['North Zone', 'Central Zone', 'South Zone', 'East Zone', 'West Zone'];
  const years = [2024, 2025, 2026];
  const rows = [];

  years.forEach((year, yearIndex) => {
    for (let month = 1; month <= 12; month++) {
      districts.forEach((district, districtIndex) => {
        dealers.forEach((dealer, dealerIndex) => {
          const zone = zones[districtIndex % zones.length];
          const base = 65000 + ((districtIndex * 24691 + dealerIndex * 45137) % 280000);
          const season = 1 + ((month % 4) * 0.055);
          const yearFactor = 1 + (yearIndex * 0.11) + (dealerIndex * 0.025);
          const dip = (districtIndex + dealerIndex + month + year) % 23 === 0 ? 0 : 1;
          const sales = Math.round(base * season * yearFactor * dip + ((month * districtIndex * dealerIndex * 1193) % 42000));
          rows.push([new Date(year, month - 1, 1), year, monthName_(month), zone, district, dealer, sales]);
        });
      });
    }
  });

  return rows;
}
