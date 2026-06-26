// =============================================================================
// Transaction categorization — turns raw Plaid categories + merchant names into
// clean, human display categories. Plaid's primary category is often too coarse
// (DoorDash/Amazon/Steam all land in vague buckets), so we layer THREE signals,
// strongest first:
//   1. Merchant keyword match (most reliable — "doordash" → Food & Dining)
//   2. Plaid's DETAILED personal-finance category (e.g. *_GROCERIES)
//   3. Plaid's PRIMARY category (coarse fallback)
// Used at read time, so improvements re-apply to all past transactions with no
// migration. User overrides (plaid_txn_overrides / merchant_rules) still win.
// =============================================================================

// The clean display categories shown throughout the app.
export type DisplayCategory =
  | "Groceries" | "Food & Dining" | "Shopping" | "Entertainment"
  | "Transportation" | "Travel" | "Bills & Utilities" | "Rent & Mortgage"
  | "Loan Payments" | "Health & Medical" | "Personal Care" | "Subscriptions"
  | "Education" | "Gifts & Donations" | "Business Services" | "Taxes & Fees"
  | "Income" | "Transfers" | "Cash & ATM" | "Other";

export const DISPLAY_CATEGORIES: DisplayCategory[] = [
  "Groceries", "Food & Dining", "Shopping", "Entertainment", "Transportation",
  "Travel", "Bills & Utilities", "Rent & Mortgage", "Loan Payments",
  "Health & Medical", "Personal Care", "Subscriptions", "Education",
  "Gifts & Donations", "Business Services", "Taxes & Fees", "Income",
  "Transfers", "Cash & ATM", "Other",
];

// Merchant keyword → category. Keys are lowercase substrings matched against the
// merchant name + raw description. Order matters only for readability; first hit
// wins. Curated from common US merchants; extend freely.
const MERCHANT_RULES: { match: string[]; cat: DisplayCategory }[] = [
  // Groceries
  { cat: "Groceries", match: ["whole foods", "trader joe", "safeway", "kroger", "albertsons", "publix", "wegmans", "aldi", "sprouts", "ralphs", "vons", "h-e-b", "heb", "food lion", "giant eagle", "stop & shop", "meijer", "winco", "smith's", "harris teeter", "instacart", "grocery", "supermarket", "fresh market"] },
  // Food & Dining (restaurants, fast food, coffee, delivery)
  { cat: "Food & Dining", match: ["doordash", "uber eats", "ubereats", "grubhub", "postmates", "seamless", "caviar", "starbucks", "dunkin", "mcdonald", "chipotle", "taco bell", "wendy", "burger king", "chick-fil-a", "chick fil a", "subway", "panera", "domino", "pizza", "kfc", "popeyes", "five guys", "shake shack", "in-n-out", "in n out", "sweetgreen", "cava", "panda express", "olive garden", "cheesecake", "denny", "ihop", "restaurant", "cafe", "coffee", "bar &", "grill", "kitchen", "eatery", "bistro", "brewery", "tavern", "diner", "doordish"] },
  // Entertainment (streaming, games, movies, events)
  { cat: "Entertainment", match: ["netflix", "hulu", "disney+", "disney plus", "hbo", "max.com", "paramount", "peacock", "spotify", "apple music", "youtube premium", "steam", "steamgames", "playstation", "xbox", "nintendo", "epic games", "twitch", "roblox", "regal", "amc theat", "cinemark", "movie", "cinema", "fandango", "ticketmaster", "stubhub", "eventbrite", "live nation", "concert", "theater", "theatre", "audible", "kindle unlimited", "patreon", "onlyfans", "crunchyroll"] },
  // Personal Care (beauty, salon, gym, wellness)
  { cat: "Personal Care", match: ["ipsy", "sephora", "ulta", "lush", "sally beauty", "salon", "barber", "nail", "spa", "massage", "planet fitness", "la fitness", "equinox", "24 hour fitness", "gym", "peloton", "classpass", "great clips", "supercuts", "dermatology", "aesthetic"] },
  // Health & Medical (incl. pharmacy, reproductive health)
  { cat: "Health & Medical", match: ["cvs", "walgreens", "rite aid", "pharmacy", "planned parenthood", "reproductive", "clinic", "hospital", "medical", "dental", "dentist", "optometr", "vision", "labcorp", "quest diagnostics", "urgent care", "doctor", "physician", "therapy", "psychiatr", "wellness center", "goodrx", "teladoc"] },
  // Transportation (gas, rideshare, parking, transit, EV)
  { cat: "Transportation", match: ["uber", "lyft", "shell", "chevron", "exxon", "mobil", "bp ", "arco", "76 ", "valero", "costco gas", "gas station", "fuel", "parking", "parkmobile", "spothero", "metro", "transit", "mta", "bart", "caltrain", "amtrak", "toll", "fastrak", "ezpass", "tesla supercharg", "electrify america", "chargepoint", "car wash"] },
  // Travel (flights, hotels, rental, booking)
  { cat: "Travel", match: ["airline", "airlines", "delta air", "united air", "american air", "southwest", "jetblue", "alaska air", "spirit air", "frontier", "hotel", "marriott", "hilton", "hyatt", "airbnb", "vrbo", "booking.com", "expedia", "priceline", "kayak", "hertz", "enterprise rent", "avis", "budget rent", "resort", "mandalay bay", "mgm", "caesars", "venetian", "bellagio", "wynn", "cruise"] },
  // Shopping (general merchandise, marketplaces, clothing, electronics, home)
  { cat: "Shopping", match: ["amazon", "amzn", "walmart", "target", "costco", "best buy", "ebay", "etsy", "aliexpress", "shein", "temu", "wayfair", "ikea", "home depot", "lowes", "lowe's", "macy", "nordstrom", "nike", "adidas", "lululemon", "gap", "old navy", "h&m", "zara", "uniqlo", "apple store", "microcenter", "newegg", "gamestop", "michaels", "hobby lobby", "tj maxx", "tjmaxx", "marshalls", "ross ", "kohls", "kohl's", "dick's sporting", "rei", "petco", "petsmart", "chewy", "bath & body", "victoria's secret"] },
  // Bills & Utilities (power, water, internet, phone, insurance)
  { cat: "Bills & Utilities", match: ["comcast", "xfinity", "spectrum", "at&t", "verizon", "t-mobile", "tmobile", "sprint", "google fi", "pg&e", "edison", "duke energy", "con edison", "national grid", "water district", "waste management", "republic services", "geico", "progressive", "state farm", "allstate", "insurance", "internet", "utility", "electric", "natural gas", "sewer"] },
  // Rent & Mortgage
  { cat: "Rent & Mortgage", match: ["rent", "apartment", "property mgmt", "property management", "mortgage", "leasing", "realty", "landlord"] },
  // Loan Payments
  { cat: "Loan Payments", match: ["loan", "sofi", "student loan", "navient", "nelnet", "great lakes", "auto loan", "lending", "affirm", "klarna", "afterpay"] },
  // Subscriptions / software (non-entertainment SaaS)
  { cat: "Subscriptions", match: ["adobe", "microsoft 365", "office 365", "google one", "google storage", "icloud", "dropbox", "notion", "1password", "lastpass", "github", "openai", "chatgpt", "anthropic", "claude", "linkedin premium", "nytimes", "wall street journal", "wsj", "medium.com", "substack"] },
  // Education
  { cat: "Education", match: ["tuition", "university", "college", "coursera", "udemy", "udacity", "skillshare", "khan academy", "duolingo", "chegg", "pearson", "scholarship", "bookstore"] },
  // Gifts & Donations
  { cat: "Gifts & Donations", match: ["donation", "donate", "gofundme", "red cross", "charity", "nonprofit", "church", "temple", "mosque", "patreon"] },
  // Cash & ATM
  { cat: "Cash & ATM", match: ["atm", "cash withdrawal", "withdrawal"] },
  // Taxes & Fees
  { cat: "Taxes & Fees", match: ["irs", "tax ", "franchise tax", "overdraft", "service fee", "atm fee", "wire fee", "interest charge", "late fee", "annual fee"] },
];

// Plaid DETAILED personal-finance category → display category. Detailed values
// look like "FOOD_AND_DRINK_GROCERIES". We match on substrings of the detailed
// string so we don't have to enumerate all 100+.
const DETAILED_RULES: { match: string; cat: DisplayCategory }[] = [
  { match: "GROCERIES", cat: "Groceries" },
  { match: "RESTAURANT", cat: "Food & Dining" },
  { match: "FAST_FOOD", cat: "Food & Dining" },
  { match: "COFFEE", cat: "Food & Dining" },
  { match: "BEER_WINE_AND_LIQUOR", cat: "Food & Dining" },
  { match: "VENDING_MACHINES", cat: "Food & Dining" },
  { match: "ONLINE_MARKETPLACES", cat: "Shopping" },
  { match: "CLOTHING_AND_ACCESSORIES", cat: "Shopping" },
  { match: "ELECTRONICS", cat: "Shopping" },
  { match: "DEPARTMENT_STORES", cat: "Shopping" },
  { match: "DISCOUNT_STORES", cat: "Shopping" },
  { match: "SPORTING_GOODS", cat: "Shopping" },
  { match: "SUPERSTORES", cat: "Shopping" },
  { match: "OFFICE_SUPPLIES", cat: "Shopping" },
  { match: "PET_SUPPLIES", cat: "Shopping" },
  { match: "GENERAL_MERCHANDISE_OTHER", cat: "Shopping" },
  { match: "TV_AND_MOVIES", cat: "Entertainment" },
  { match: "MUSIC_AND_AUDIO", cat: "Entertainment" },
  { match: "VIDEO_GAMES", cat: "Entertainment" },
  { match: "CASINOS_AND_GAMBLING", cat: "Entertainment" },
  { match: "SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS", cat: "Entertainment" },
  { match: "GAS", cat: "Transportation" },
  { match: "PARKING", cat: "Transportation" },
  { match: "PUBLIC_TRANSIT", cat: "Transportation" },
  { match: "TAXIS_AND_RIDE_SHARES", cat: "Transportation" },
  { match: "TOLLS", cat: "Transportation" },
  { match: "BIKES_AND_SCOOTERS", cat: "Transportation" },
  { match: "FLIGHTS", cat: "Travel" },
  { match: "LODGING", cat: "Travel" },
  { match: "RENTAL_CARS", cat: "Travel" },
  { match: "RENT", cat: "Rent & Mortgage" },
  { match: "MORTGAGE", cat: "Rent & Mortgage" },
  { match: "GAS_AND_ELECTRICITY", cat: "Bills & Utilities" },
  { match: "INTERNET_AND_CABLE", cat: "Bills & Utilities" },
  { match: "TELEPHONE", cat: "Bills & Utilities" },
  { match: "WATER", cat: "Bills & Utilities" },
  { match: "SEWAGE_AND_WASTE_MANAGEMENT", cat: "Bills & Utilities" },
  { match: "INSURANCE", cat: "Bills & Utilities" },
  { match: "GYMS_AND_FITNESS_CENTERS", cat: "Personal Care" },
  { match: "HAIR_AND_BEAUTY", cat: "Personal Care" },
  { match: "LAUNDRY_AND_DRY_CLEANING", cat: "Personal Care" },
  { match: "PHARMACIES", cat: "Health & Medical" },
  { match: "PRIMARY_CARE", cat: "Health & Medical" },
  { match: "DENTAL_CARE", cat: "Health & Medical" },
  { match: "EYE_CARE", cat: "Health & Medical" },
  { match: "NURSING_CARE", cat: "Health & Medical" },
  { match: "VETERINARY", cat: "Health & Medical" },
  { match: "STUDENT", cat: "Loan Payments" },
  { match: "CAR_PAYMENT", cat: "Loan Payments" },
  { match: "PERSONAL_LOAN", cat: "Loan Payments" },
  { match: "CREDIT_CARD_PAYMENT", cat: "Transfers" },
  { match: "EDUCATION", cat: "Education" },
  { match: "DONATIONS", cat: "Gifts & Donations" },
  { match: "ATM", cat: "Cash & ATM" },
  { match: "WIRE", cat: "Transfers" },
];

// Plaid PRIMARY category → display category (coarse fallback).
const PRIMARY_MAP: Record<string, DisplayCategory> = {
  INCOME: "Income",
  TRANSFER_IN: "Transfers",
  TRANSFER_OUT: "Transfers",
  LOAN_PAYMENTS: "Loan Payments",
  BANK_FEES: "Taxes & Fees",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Food & Dining",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Shopping",
  MEDICAL: "Health & Medical",
  PERSONAL_CARE: "Personal Care",
  GENERAL_SERVICES: "Business Services",
  GOVERNMENT_AND_NON_PROFIT: "Gifts & Donations",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Bills & Utilities",
};

// Categorize one transaction. `plaidDetailed` / `plaidPrimary` are Plaid's
// personal_finance_category fields; `merchant`/`name` are the display strings.
export function categorize(opts: {
  merchant?: string | null;
  name?: string | null;
  plaidDetailed?: string | null;
  plaidPrimary?: string | null;
}): DisplayCategory {
  const hay = `${opts.merchant ?? ""} ${opts.name ?? ""}`.toLowerCase();

  // 1) Merchant keyword — strongest signal, overrides bad Plaid categories.
  for (const rule of MERCHANT_RULES) {
    if (rule.match.some((m) => hay.includes(m))) return rule.cat;
  }

  // 2) Plaid detailed category.
  const detailed = (opts.plaidDetailed ?? "").toUpperCase();
  if (detailed) {
    for (const rule of DETAILED_RULES) {
      if (detailed.includes(rule.match)) return rule.cat;
    }
  }

  // 3) Plaid primary category.
  const primary = (opts.plaidPrimary ?? "").toUpperCase();
  if (PRIMARY_MAP[primary]) return PRIMARY_MAP[primary];

  return "Other";
}
