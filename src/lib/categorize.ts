import { SpendingCategory, CategoryRule } from "./types";

// Trailing \b removed — "mcdonald" must match "mcdonalds", "sainsbury" must match "sainsburys", etc.
const CATEGORY_RULES: Array<{ pattern: RegExp; category: SpendingCategory }> = [
  // ── Income ──
  { pattern: /\b(salary|wages|payroll|bacs credit|interest paid)/i, category: "income" },

  // ── Groceries ──
  { pattern: /\b(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co-op\b|coop\b|ocado|iceland\b|m&s food|marks.spencer|m&s simply|farmfoods|heron foods|jack'?s\b|spar\b|premier store|premier convenience|nisa\b|budgens|one stop|londis|costcutter|bestway|food warehouse|whole foods|planet organic)/i, category: "groceries" },

  // ── Eating Out ──
  { pattern: /\b(mcdonald|burger king|kfc|nando|greggs|costa|starbucks|pret a manger|pret\b|deliveroo|uber eat|just eat|domino|pizza|restaurant|cafe\b|coffee|subway\b|five guys|wagamama|zizzi|frankie|gourmet burger|leon\b|itsu\b|wasabi\b|yo! sushi|tortilla\b|chipotle|chick-?fil|wetherspoon|spoons\b|hungry horse|toby carvery|harvester|beefeater|brewers fayre|chicken|kebab|chippy|fish.?bar|chip shop|takeaway|chinese|indian|thai|usa chick)/i, category: "eating-out" },

  // ── Transport ──
  { pattern: /\b(tfl\b|transport for london|trainline|national rail|uber(?! eat)|bolt(?! food)|parking|fuel|petrol|diesel|shell\b|bp\b|esso\b|texaco|dart charge|congestion|bus\b|halfords|kwik.?fit|mot\b|car.?wash|euro.?car|avis|hertz|enterprise|addison lee|zip.?car|voi\b|lime\b|jet\b )/i, category: "transport" },

  // ── Bills & Utilities ──
  { pattern: /\b(council tax|water|electric|gas\b|british gas|edf\b|eon\b|e\.on|octopus energy|thames water|virgin media|bt\b|sky\b|broadband|internet|rent\b|mortgage|insurance|hmrc|tv.?licen|o2\b|vodafone|three\b|h3g|ee\b|giffgaff|tesco mobile|plusnet|talktalk|now tv|now broadband|scottish power|sse\b|bulb|utility|openreach|united utilit)/i, category: "bills" },

  // ── Subscriptions ──
  { pattern: /\b(netflix|spotify|amazon prime|disney|apple\.com|apple\.com\/bill|youtube premium|audible|kindle|crunchyroll|paramount|hbo|dazn|now tv|hayu|britbox|membership|subscri|patreon|substack|medium\.com|chatgpt|openai|claude\.ai|github|icloud|google storage|google one|dropbox|1password|notion|canva|adobe|microsoft 365|office 365|xbox game pass|ps.?plus|ea play|cloudflare|paypal \*cloud|zwift|strava|headspace|calm\b)/i, category: "subscriptions" },

  // ── Shopping ──
  { pattern: /\b(amazon(?! prime)|ebay|argos|john lewis|currys|ikea|primark|next\b|h&m|zara|asos|shein|boohoo|plt\b|pretty little|tk.?maxx|home.?bargain|b&m\b|poundland|wilko|the range|dunelm|screwfix|toolstation|wickes|b&q|robert dyas|smyths|the works|whsmith|waterstones|apple store|samsung|klarna|clearpay|laybuy|very\.co|littlewoods|studio\.co|matalan|george\b|tu clothing|sports direct|jd sports|decathlon|nike\b|adidas|new look|river island|uniqlo|superdry|fat face|joules|oliver bonas|overgear)/i, category: "shopping" },

  // ── Entertainment ──
  { pattern: /\b(cinema|odeon|cineworld|vue\b|theatre|ticket|gig\b|concert|gaming|steam\b|playstation|xbox|nintendo|twitch|betting|bet365|william hill|paddy.?power|ladbrokes|sky.?bet|coral\b|national lottery|lotto|camelot|arcade|bowling|mini.?golf|escape room|laser|trampoline|thorpe|alton tower|legoland|zoo|aquarium|museum)/i, category: "entertainment" },

  // ── Health ──
  { pattern: /\b(pharmacy|boots(?! the)|superdrug|dentist|doctor|hospital|nhs|gym\b|fitness|pure gym|the gym|anytime fitness|david lloyd|nuffield|bupa|specsaver|vision express|optical|physio|chiroprac|osteopath|counsell|therapy|mental health|well pharmacy|lloyds pharmacy)/i, category: "health" },

  // ── Cash ──
  { pattern: /\b(cash|atm|withdrawal|cashpoint|link\b.*atm)/i, category: "cash" },

  // ── Transfers (these are NOT spending — just money moving between accounts) ──
  { pattern: /\b(transfer|etoro|trading ?212|freetrade|vanguard|hargreaves|hl\b|interactive investor|moneybox|plum\b|chip\b.*save|revolut\b|monzo\b|starling\b|wise\b|paypal(?! \*))/i, category: "transfers" },
];

// Barclays subcategory → fallback category (used when description doesn't match)
const SUBCATEGORY_HINTS: Record<string, SpendingCategory> = {
  "cash withdrawal": "cash",
  "standing order": "bills",
  "direct debit": "bills",
  "bill payment": "bills",
  "funds transfer": "transfers",
  "counter credit": "income",
  "credit payment": "income",
};

// Barclays descriptions often end with " ON DD MMM CPM/BCC/FT/DD/BBP" — strip that noise
function cleanDescription(desc: string): string {
  return desc
    .replace(/\s+ON\s+\d{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(CPM|BCC|FT|BBP|DD|SO|CR)?\s*$/i, "")
    .replace(/\s+\d{5,}\s*$/g, "")  // trailing reference numbers
    .replace(/AMOUNT IN [A-Z]{3}\s*[\d.]+/i, "")  // "AMOUNT IN USD 2.50"
    .trim();
}

export function categorizeTransaction(
  description: string,
  amount: number,
  customRules?: CategoryRule[],
  subcategory?: string
): SpendingCategory {
  if (amount > 0) return "income";

  const cleaned = cleanDescription(description);

  if (customRules) {
    for (const rule of customRules) {
      if (cleaned.toLowerCase().includes(rule.pattern.toLowerCase())) {
        return rule.category;
      }
    }
  }

  // Try matching against cleaned description first, then raw
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(cleaned) || rule.pattern.test(description)) {
      return rule.category;
    }
  }

  // Use bank subcategory as a hint when description patterns don't match
  if (subcategory) {
    const hint = SUBCATEGORY_HINTS[subcategory.toLowerCase()];
    if (hint) return hint;
  }

  return "other";
}
