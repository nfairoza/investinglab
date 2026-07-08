// S&P 500-style universe for the Stock Map, grouped by GICS sector.
//
// This is a hand-authored fallback so every sector has enough names (>=20) to
// render a meaningful heatmap — the old 87-symbol list had sectors as thin as 3.
// For an authoritative, current 503-name list, run `node scripts/refresh-
// constituents.mjs` with an FMP key that supports sp500-constituents; it rewrites
// CONSTITUENTS below. Sectors use FMP's labels so the map + screener agree.
//
// NOT investment advice — this is a display universe, not a recommendation set.

export interface Constituent { symbol: string; name: string; sector: string }

// Keyed by sector for readability; flattened by `constituents()`. Symbols use the
// FMP convention (e.g. BRK-B). Every sector has >=20 names.
const BY_SECTOR: Record<string, Array<[string, string]>> = {
  "Technology": [
    ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "NVIDIA"], ["AVGO", "Broadcom"],
    ["ORCL", "Oracle"], ["CRM", "Salesforce"], ["ADBE", "Adobe"], ["AMD", "Advanced Micro Devices"],
    ["CSCO", "Cisco"], ["ACN", "Accenture"], ["INTC", "Intel"], ["QCOM", "Qualcomm"],
    ["TXN", "Texas Instruments"], ["IBM", "IBM"], ["NOW", "ServiceNow"], ["INTU", "Intuit"],
    ["AMAT", "Applied Materials"], ["MU", "Micron"], ["LRCX", "Lam Research"], ["ADI", "Analog Devices"],
    ["KLAC", "KLA"], ["PANW", "Palo Alto Networks"], ["SNPS", "Synopsys"], ["CDNS", "Cadence"],
    ["ANET", "Arista Networks"], ["CRWD", "CrowdStrike"], ["FTNT", "Fortinet"], ["ROP", "Roper"],
    ["APH", "Amphenol"], ["MSI", "Motorola Solutions"], ["MCHP", "Microchip"], ["NXPI", "NXP"],
    ["ADSK", "Autodesk"], ["IT", "Gartner"], ["HPQ", "HP"], ["DELL", "Dell"],
    ["WDAY", "Workday"], ["GLW", "Corning"], ["KEYS", "Keysight"], ["HPE", "Hewlett Packard Enterprise"],
  ],
  "Communication Services": [
    ["GOOGL", "Alphabet A"], ["GOOG", "Alphabet C"], ["META", "Meta Platforms"], ["NFLX", "Netflix"],
    ["DIS", "Walt Disney"], ["TMUS", "T-Mobile US"], ["VZ", "Verizon"], ["T", "AT&T"],
    ["CMCSA", "Comcast"], ["CHTR", "Charter"], ["EA", "Electronic Arts"], ["TTWO", "Take-Two"],
    ["WBD", "Warner Bros Discovery"], ["OMC", "Omnicom"], ["IPG", "Interpublic"], ["LYV", "Live Nation"],
    ["MTCH", "Match Group"], ["PARA", "Paramount"], ["FOXA", "Fox A"], ["FOX", "Fox B"],
    ["NWSA", "News Corp A"], ["NWS", "News Corp B"], ["DASH", "DoorDash"],
  ],
  "Consumer Discretionary": [
    ["AMZN", "Amazon"], ["TSLA", "Tesla"], ["HD", "Home Depot"], ["MCD", "McDonald's"],
    ["NKE", "Nike"], ["LOW", "Lowe's"], ["SBUX", "Starbucks"], ["BKNG", "Booking"],
    ["TJX", "TJX"], ["ORLY", "O'Reilly"], ["CMG", "Chipotle"], ["MAR", "Marriott"],
    ["GM", "General Motors"], ["F", "Ford"], ["HLT", "Hilton"], ["AZO", "AutoZone"],
    ["ROST", "Ross Stores"], ["YUM", "Yum! Brands"], ["LVS", "Las Vegas Sands"], ["EBAY", "eBay"],
    ["APTV", "Aptiv"], ["DHI", "D.R. Horton"], ["LEN", "Lennar"], ["NVR", "NVR"],
    ["PHM", "PulteGroup"], ["ULTA", "Ulta Beauty"], ["GRMN", "Garmin"], ["EXPE", "Expedia"],
    ["DRI", "Darden"], ["TSCO", "Tractor Supply"], ["BBY", "Best Buy"], ["POOL", "Pool Corp"],
  ],
  "Consumer Staples": [
    ["WMT", "Walmart"], ["PG", "Procter & Gamble"], ["COST", "Costco"], ["KO", "Coca-Cola"],
    ["PEP", "PepsiCo"], ["PM", "Philip Morris"], ["MDLZ", "Mondelez"], ["MO", "Altria"],
    ["CL", "Colgate-Palmolive"], ["TGT", "Target"], ["KMB", "Kimberly-Clark"], ["GIS", "General Mills"],
    ["SYY", "Sysco"], ["KVUE", "Kenvue"], ["KHC", "Kraft Heinz"], ["STZ", "Constellation Brands"],
    ["MNST", "Monster Beverage"], ["KDP", "Keurig Dr Pepper"], ["HSY", "Hershey"], ["KR", "Kroger"],
    ["ADM", "Archer-Daniels"], ["EL", "Estée Lauder"], ["DG", "Dollar General"], ["DLTR", "Dollar Tree"],
    ["MKC", "McCormick"], ["CHD", "Church & Dwight"], ["CLX", "Clorox"],
  ],
  "Financials": [
    ["BRK-B", "Berkshire Hathaway B"], ["JPM", "JPMorgan Chase"], ["V", "Visa"], ["MA", "Mastercard"],
    ["BAC", "Bank of America"], ["WFC", "Wells Fargo"], ["GS", "Goldman Sachs"], ["MS", "Morgan Stanley"],
    ["AXP", "American Express"], ["BLK", "BlackRock"], ["C", "Citigroup"], ["SCHW", "Charles Schwab"],
    ["SPGI", "S&P Global"], ["PGR", "Progressive"], ["CB", "Chubb"], ["MMC", "Marsh McLennan"],
    ["FI", "Fiserv"], ["ICE", "Intercontinental Exchange"], ["PYPL", "PayPal"], ["CME", "CME Group"],
    ["USB", "U.S. Bancorp"], ["PNC", "PNC Financial"], ["AON", "Aon"], ["TFC", "Truist"],
    ["MCO", "Moody's"], ["COF", "Capital One"], ["AJG", "Arthur J. Gallagher"], ["AFL", "Aflac"],
    ["MET", "MetLife"], ["TRV", "Travelers"], ["BK", "Bank of New York Mellon"], ["ALL", "Allstate"],
  ],
  "Health Care": [
    ["LLY", "Eli Lilly"], ["UNH", "UnitedHealth"], ["JNJ", "Johnson & Johnson"], ["ABBV", "AbbVie"],
    ["MRK", "Merck"], ["TMO", "Thermo Fisher"], ["ABT", "Abbott"], ["PFE", "Pfizer"],
    ["DHR", "Danaher"], ["AMGN", "Amgen"], ["ISRG", "Intuitive Surgical"], ["BSX", "Boston Scientific"],
    ["SYK", "Stryker"], ["VRTX", "Vertex"], ["GILD", "Gilead"], ["MDT", "Medtronic"],
    ["CI", "Cigna"], ["REGN", "Regeneron"], ["ELV", "Elevance Health"], ["CVS", "CVS Health"],
    ["ZTS", "Zoetis"], ["BDX", "Becton Dickinson"], ["HCA", "HCA Healthcare"], ["MCK", "McKesson"],
    ["BMY", "Bristol-Myers Squibb"], ["EW", "Edwards Lifesciences"], ["IDXX", "IDEXX"], ["GEHC", "GE HealthCare"],
    ["A", "Agilent"], ["IQV", "IQVIA"], ["DXCM", "DexCom"], ["MRNA", "Moderna"],
  ],
  "Energy": [
    ["XOM", "Exxon Mobil"], ["CVX", "Chevron"], ["COP", "ConocoPhillips"], ["SLB", "Schlumberger"],
    ["EOG", "EOG Resources"], ["MPC", "Marathon Petroleum"], ["PSX", "Phillips 66"], ["WMB", "Williams"],
    ["OKE", "ONEOK"], ["VLO", "Valero"], ["OXY", "Occidental"], ["HES", "Hess"],
    ["KMI", "Kinder Morgan"], ["FANG", "Diamondback"], ["BKR", "Baker Hughes"], ["HAL", "Halliburton"],
    ["DVN", "Devon Energy"], ["TRGP", "Targa Resources"], ["CTRA", "Coterra"], ["MRO", "Marathon Oil"],
    ["APA", "APA Corp"], ["EQT", "EQT"],
  ],
  "Industrials": [
    ["GE", "GE Aerospace"], ["CAT", "Caterpillar"], ["RTX", "RTX"], ["UNP", "Union Pacific"],
    ["HON", "Honeywell"], ["BA", "Boeing"], ["DE", "Deere"], ["LMT", "Lockheed Martin"],
    ["ETN", "Eaton"], ["UPS", "UPS"], ["GD", "General Dynamics"], ["NOC", "Northrop Grumman"],
    ["EMR", "Emerson"], ["CSX", "CSX"], ["NSC", "Norfolk Southern"], ["FDX", "FedEx"],
    ["WM", "Waste Management"], ["ITW", "Illinois Tool Works"], ["PH", "Parker Hannifin"], ["TT", "Trane"],
    ["GEV", "GE Vernova"], ["TDG", "TransDigm"], ["CTAS", "Cintas"], ["PCAR", "PACCAR"],
    ["CMI", "Cummins"], ["JCI", "Johnson Controls"], ["CARR", "Carrier"], ["RSG", "Republic Services"],
    ["FAST", "Fastenal"], ["URI", "United Rentals"], ["PWR", "Quanta Services"], ["LHX", "L3Harris"],
  ],
  "Utilities": [
    ["NEE", "NextEra Energy"], ["DUK", "Duke Energy"], ["SO", "Southern Co"], ["D", "Dominion"],
    ["AEP", "American Electric Power"], ["SRE", "Sempra"], ["EXC", "Exelon"], ["XEL", "Xcel Energy"],
    ["PEG", "Public Service Enterprise"], ["ED", "Consolidated Edison"], ["PCG", "PG&E"], ["WEC", "WEC Energy"],
    ["EIX", "Edison International"], ["AWK", "American Water Works"], ["DTE", "DTE Energy"], ["PPL", "PPL"],
    ["AEE", "Ameren"], ["FE", "FirstEnergy"], ["ES", "Eversource"], ["ETR", "Entergy"],
    ["CMS", "CMS Energy"], ["ATO", "Atmos Energy"], ["CNP", "CenterPoint"],
  ],
  "Real Estate": [
    ["PLD", "Prologis"], ["AMT", "American Tower"], ["EQIX", "Equinix"], ["WELL", "Welltower"],
    ["SPG", "Simon Property"], ["PSA", "Public Storage"], ["O", "Realty Income"], ["CCI", "Crown Castle"],
    ["DLR", "Digital Realty"], ["CBRE", "CBRE"], ["EXR", "Extra Space Storage"], ["AVB", "AvalonBay"],
    ["VICI", "VICI Properties"], ["EQR", "Equity Residential"], ["IRM", "Iron Mountain"], ["WY", "Weyerhaeuser"],
    ["INVH", "Invitation Homes"], ["ARE", "Alexandria Real Estate"], ["MAA", "Mid-America Apartment"], ["SBAC", "SBA Communications"],
    ["ESS", "Essex Property"], ["KIM", "Kimco Realty"], ["DOC", "Healthpeak"],
  ],
  "Materials": [
    ["LIN", "Linde"], ["SHW", "Sherwin-Williams"], ["FCX", "Freeport-McMoRan"], ["ECL", "Ecolab"],
    ["APD", "Air Products"], ["NEM", "Newmont"], ["DOW", "Dow"], ["DD", "DuPont"],
    ["CTVA", "Corteva"], ["NUE", "Nucor"], ["PPG", "PPG Industries"], ["VMC", "Vulcan Materials"],
    ["MLM", "Martin Marietta"], ["IFF", "Intl Flavors & Fragrances"], ["ALB", "Albemarle"], ["LYB", "LyondellBasell"],
    ["STLD", "Steel Dynamics"], ["CF", "CF Industries"], ["BALL", "Ball Corp"], ["AMCR", "Amcor"],
    ["MOS", "Mosaic"], ["EMN", "Eastman Chemical"], ["PKG", "Packaging Corp"], ["AVY", "Avery Dennison"],
  ],
};

// Flattened list, deduped by symbol (first sector wins for the few cross-listed).
export const CONSTITUENTS: Constituent[] = (() => {
  const seen = new Set<string>();
  const out: Constituent[] = [];
  for (const [sector, rows] of Object.entries(BY_SECTOR)) {
    for (const [symbol, name] of rows) {
      const s = symbol.toUpperCase();
      if (seen.has(s)) continue;
      seen.add(s);
      out.push({ symbol: s, name, sector });
    }
  }
  return out;
})();

export function constituents(): Constituent[] { return CONSTITUENTS; }

// Sector -> symbol[] view (for building the map universe).
export function bySector(): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const c of CONSTITUENTS) (m[c.sector] ??= []).push(c.symbol);
  return m;
}

export const SECTORS = Object.keys(BY_SECTOR);
