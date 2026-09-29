# Sales Dashboard Demo

Google Apps Script diye publish korar jonno dynamic sales dashboard.

## Files

- `Code.gs` - Sheet data read kore web app serve kore
- `Index.html` - Bangladesh map, filters, KPIs, line charts and table UI
- `logo.jpg` - Dashboard header logo for local preview

## Setup

1. Google Sheet open korun.
2. Extensions > Apps Script open korun.
3. `Code.gs` file-er content paste korun.
4. New HTML file create kore name din `Index`, tarpor `Index.html` content paste korun.
5. Apps Script editor theke `setupDemoData` run korun.
6. Deploy > New deployment > Web app select korun.
7. Execute as: `Me`, Who has access: apnar need onujayi select kore Deploy korun.

## Sheet Columns

Sheet tab name: `SalesData`

Required columns:

`Districts`, `Sales`

Recommended columns:

`Date`, `Year`, `Month`, `Zone`, `Districts`, `Dealer`, `Sales`

Notes:

- `Districts` column-e Bangladesh district name thakbe.
- `Zone` column-e sales zone/region name thakbe. Dashboard-e Zone dropdown diye filter kora jabe.
- `Dealer` column-e dealer/distributor name thakbe. Column na thakle dashboard `All Dealers` hishebe data dhorbe.
- `Sales` column numeric hote hobe.
- `Year` and `Month` thakle dashboard direct use korbe.
- `Year` and `Month` na thakle `Date` column theke year/month read korbe.
- `Month` value `Jan`, `February`, `1`, `2` etc. hote pare.

## Included Analysis

- Bangladesh map with district names
- Dynamic Bangladesh district boundary map using GeoJSON and Leaflet
- Year dropdown
- Month dropdown
- Zone dropdown
- MTD Sales
- YTD Sales
- MTD Growth % vs previous month
- YTD Growth % vs same YTD previous year
- Previous Year Comparison vs same month previous year
- Previous Month Growth %
- Dealer-wise YTD Sales Comparison by year with growth %
- Dealer-wise MTD Sales Comparison by year with growth %
- Growth Status Distribution chart
- Cumulative YTD Sales Trend chart
- Monthly Sales Trend line chart
- Year-wise Monthly Growth line chart
- District ranking table

## Growth Color Rules

- Positive growth: Green
- Negative growth: Red
- No sales / 0% growth: Grey

Sheet update korle dashboard-er `Refresh Data` button click korlei latest data ashbe.

## Upload 20,500 Rows

Dashboard thekei CSV upload kora jabe.

1. Excel data CSV format-e save korun.
2. CSV header ei order-e rakhun: `Date`, `Year`, `Month`, `Zone`, `Districts`, `Dealer`, `Sales`. Column name flexible-o kora ache — `District`, `Clients` ba `MT`/`Amount` o chalbe, tahole dashboard canonical name-e convert kore sheet-e lekha hoy.
3. Published dashboard open korun.
4. `Upload CSV` button click korun.
5. CSV file select korun ba CSV text paste korun.
6. Existing data replace korte chaile `Replace current SalesData` checked rakhun.
7. Upload To Sheet` click korun.
8. Upload complete hole dashboard auto refresh hobe.

Example CSV:

```csv
Date,Year,Month,Zone,Districts,Dealer,Sales
2026-01-01,2026,Jan,Central Zone,Dhaka,Dealer A,1250000
2026-01-01,2026,Jan,North Zone,Rangpur,Dealer B,850000
```

20,500 rows upload-er jonno Apps Script chunks use kore data write kore, tai manual paste-er cheye stable.

## Dynamic Map

Dashboard `Code.gs` file-e `DISTRICT_GEOJSON_URL` variable ache. Ekhane Bangladesh district boundary GeoJSON URL deya ache. Apnar nijer GeoJSON source thakle oi URL replace korlei map boundary source change hobe.

Map load hole district polygon dynamically color hobe Sheet-er selected year/month growth data onujayi. Map source load na hole fallback label map show korbe.

## Note

Exact district spelling Sheet-er `Districts` column-er sathe GeoJSON district name match korle best result paben.
