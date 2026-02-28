// Common eToro instrument names → Yahoo Finance ticker symbols
// eToro uses full company/instrument names in their CSVs.
// This map covers the most commonly traded instruments on eToro.

export const ETORO_TICKER_MAP: Record<string, string> = {
  // Tech
  "apple": "AAPL",
  "microsoft": "MSFT",
  "amazon.com": "AMZN",
  "amazon": "AMZN",
  "alphabet": "GOOGL",
  "google": "GOOGL",
  "meta platforms": "META",
  "facebook": "META",
  "nvidia": "NVDA",
  "nvidia corporation": "NVDA",
  "tesla": "TSLA",
  "tesla motors": "TSLA",
  "netflix": "NFLX",
  "amd": "AMD",
  "advanced micro devices": "AMD",
  "intel": "INTC",
  "intel corporation": "INTC",
  "qualcomm": "QCOM",
  "broadcom": "AVGO",
  "adobe": "ADBE",
  "salesforce": "CRM",
  "salesforce.com": "CRM",
  "paypal": "PYPL",
  "paypal holdings": "PYPL",
  "shopify": "SHOP",
  "uber": "UBER",
  "uber technologies": "UBER",
  "snap": "SNAP",
  "snap inc": "SNAP",
  "palantir": "PLTR",
  "palantir technologies": "PLTR",
  "snowflake": "SNOW",
  "crowdstrike": "CRWD",
  "servicenow": "NOW",
  "oracle": "ORCL",
  "ibm": "IBM",
  "cisco": "CSCO",
  "cisco systems": "CSCO",
  "dell technologies": "DELL",
  "dell": "DELL",
  "hp": "HPQ",
  "twilio": "TWLO",
  "spotify": "SPOT",
  "spotify technology": "SPOT",
  "pinterest": "PINS",
  "roblox": "RBLX",
  "unity software": "U",
  "datadog": "DDOG",
  "cloudflare": "NET",
  "fortinet": "FTNT",
  "palo alto networks": "PANW",
  "arm holdings": "ARM",
  "arm": "ARM",
  "asml": "ASML",
  "asml holding": "ASML",
  "tsmc": "TSM",
  "taiwan semiconductor": "TSM",
  "micron": "MU",
  "micron technology": "MU",
  "marvell technology": "MRVL",
  "mongodb": "MDB",
  "elastic": "ESTC",
  "arista networks": "ANET",
  "supermicro": "SMCI",
  "super micro computer": "SMCI",

  // Finance
  "jpmorgan chase": "JPM",
  "jpmorgan": "JPM",
  "bank of america": "BAC",
  "wells fargo": "WFC",
  "goldman sachs": "GS",
  "morgan stanley": "MS",
  "citigroup": "C",
  "visa": "V",
  "mastercard": "MA",
  "american express": "AXP",
  "blackrock": "BLK",
  "charles schwab": "SCHW",
  "square": "SQ",
  "block": "SQ",
  "block inc": "SQ",
  "sofi": "SOFI",
  "sofi technologies": "SOFI",
  "coinbase": "COIN",
  "coinbase global": "COIN",
  "robinhood": "HOOD",
  "robinhood markets": "HOOD",

  // Healthcare
  "johnson & johnson": "JNJ",
  "unitedhealth": "UNH",
  "unitedhealth group": "UNH",
  "pfizer": "PFE",
  "eli lilly": "LLY",
  "abbvie": "ABBV",
  "merck": "MRK",
  "amgen": "AMGN",
  "moderna": "MRNA",
  "intuitive surgical": "ISRG",
  "danaher": "DHR",
  "gilead sciences": "GILD",
  "regeneron": "REGN",
  "biogen": "BIIB",
  "novavax": "NVAX",

  // Consumer
  "walt disney": "DIS",
  "disney": "DIS",
  "the walt disney": "DIS",
  "coca-cola": "KO",
  "coca cola": "KO",
  "pepsico": "PEP",
  "pepsi": "PEP",
  "mcdonald's": "MCD",
  "mcdonalds": "MCD",
  "starbucks": "SBUX",
  "nike": "NKE",
  "procter & gamble": "PG",
  "procter and gamble": "PG",
  "costco": "COST",
  "walmart": "WMT",
  "target": "TGT",
  "home depot": "HD",
  "the home depot": "HD",
  "lowe's": "LOW",
  "lowes": "LOW",

  // Energy
  "exxon mobil": "XOM",
  "exxonmobil": "XOM",
  "chevron": "CVX",
  "conocophillips": "COP",
  "shell": "SHEL",
  "bp": "BP",
  "enphase energy": "ENPH",
  "nextera energy": "NEE",

  // Industrial / Other
  "boeing": "BA",
  "the boeing company": "BA",
  "lockheed martin": "LMT",
  "caterpillar": "CAT",
  "3m": "MMM",
  "general electric": "GE",
  "honeywell": "HON",
  "raytheon": "RTX",
  "rtx": "RTX",
  "union pacific": "UNP",
  "deere": "DE",
  "john deere": "DE",

  // EV / Auto
  "rivian": "RIVN",
  "rivian automotive": "RIVN",
  "lucid": "LCID",
  "lucid group": "LCID",
  "nio": "NIO",
  "xpeng": "XPEV",
  "li auto": "LI",
  "ford": "F",
  "ford motor": "F",
  "general motors": "GM",
  "toyota": "TM",
  "toyota motor": "TM",

  // Telecom / Media
  "at&t": "T",
  "att": "T",
  "verizon": "VZ",
  "t-mobile": "TMUS",
  "comcast": "CMCSA",

  // ETFs
  "spdr s&p 500": "SPY",
  "spdr s&p 500 etf trust": "SPY",
  "s&p 500 spdr": "SPY",
  "spy": "SPY",
  "vanguard s&p 500": "VOO",
  "voo": "VOO",
  "invesco qqq": "QQQ",
  "qqq": "QQQ",
  "ishares core s&p 500": "IVV",
  "ark innovation": "ARKK",
  "ark innovation etf": "ARKK",
  "ishares msci emerging": "EEM",
  "vanguard total stock": "VTI",
  "vanguard ftse all-world": "VWRL.L",

  // Crypto (Yahoo Finance format)
  "bitcoin": "BTC-USD",
  "btc": "BTC-USD",
  "ethereum": "ETH-USD",
  "eth": "ETH-USD",
  "ripple": "XRP-USD",
  "xrp": "XRP-USD",
  "cardano": "ADA-USD",
  "ada": "ADA-USD",
  "solana": "SOL-USD",
  "sol": "SOL-USD",
  "dogecoin": "DOGE-USD",
  "doge": "DOGE-USD",
  "polkadot": "DOT-USD",
  "polygon": "MATIC-USD",
  "matic": "MATIC-USD",
  "avalanche": "AVAX-USD",
  "chainlink": "LINK-USD",
  "litecoin": "LTC-USD",
  "ltc": "LTC-USD",
  "uniswap": "UNI-USD",
  "aave": "AAVE-USD",
  "algorand": "ALGO-USD",
  "stellar": "XLM-USD",
  "xlm": "XLM-USD",
  "cosmos": "ATOM-USD",
  "near protocol": "NEAR-USD",
  "near": "NEAR-USD",
  "shiba inu": "SHIB-USD",
  "tezos": "XTZ-USD",
  "eos": "EOS-USD",
  "filecoin": "FIL-USD",
  "the sandbox": "SAND-USD",
  "decentraland": "MANA-USD",
  "axie infinity": "AXS-USD",
  "apecoin": "APE-USD",
  "iota": "IOTA-USD",

  // UK stocks
  "barclays": "BARC.L",
  "hsbc": "HSBA.L",
  "gsk": "GSK.L",
  "glaxosmithkline": "GSK.L",
  "astrazeneca": "AZN.L",
  "unilever": "ULVR.L",
  "vodafone": "VOD.L",
  "rolls-royce": "RR.L",
  "rolls royce": "RR.L",
  "lloyds": "LLOY.L",
  "lloyds banking": "LLOY.L",
  "tesco": "TSCO.L",
  "rio tinto": "RIO.L",
  "diageo": "DGE.L",

  // Commodities (eToro names)
  "gold": "GC=F",
  "silver": "SI=F",
  "oil": "CL=F",
  "natural gas": "NG=F",
  "platinum": "PL=F",
  "copper": "HG=F",
};

/**
 * Try to resolve an eToro instrument name to a Yahoo Finance ticker symbol.
 * Returns null if no match found.
 */
export function resolveTickerFromName(instrumentName: string): string | null {
  const normalized = instrumentName
    .toLowerCase()
    .replace(/^(buy|sell)\s+/i, "")
    .replace(/\s+(inc\.?|corp\.?|ltd\.?|plc\.?|co\.?|company|group|holdings|technologies|motors)\s*$/i, "")
    .trim();

  // Direct match
  if (ETORO_TICKER_MAP[normalized]) return ETORO_TICKER_MAP[normalized];

  // Try without trailing suffixes
  for (const [key, ticker] of Object.entries(ETORO_TICKER_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return ticker;
    }
  }

  return null;
}

/**
 * Resolve tickers for a list of instrument names.
 * Returns a map of instrumentName → ticker (or null if unresolved).
 */
export function resolveTickersFromNames(
  instrumentNames: string[]
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const name of instrumentNames) {
    result[name] = resolveTickerFromName(name);
  }
  return result;
}
