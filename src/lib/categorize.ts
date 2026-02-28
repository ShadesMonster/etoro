import { SpendingCategory, CategoryRule } from "./types";

const CATEGORY_RULES: Array<{ pattern: RegExp; category: SpendingCategory }> = [
  { pattern: /\b(salary|wages|payroll|bacs credit)\b/i, category: "income" },
  { pattern: /\b(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co-op|ocado|iceland|m&s food|marks.spencer)\b/i, category: "groceries" },
  { pattern: /\b(mcdonald|burger king|kfc|nando|greggs|costa|starbucks|pret|deliveroo|uber eats|just eat|domino|pizza|restaurant|cafe|coffee)\b/i, category: "eating-out" },
  { pattern: /\b(tfl|transport for london|trainline|national rail|uber|bolt|parking|fuel|petrol|shell|bp|esso|dart charge|congestion|bus)\b/i, category: "transport" },
  { pattern: /\b(council tax|water|electric|gas|british gas|edf|eon|octopus energy|thames water|virgin media|bt |sky |broadband|internet|rent|mortgage|insurance)\b/i, category: "bills" },
  { pattern: /\b(netflix|spotify|amazon prime|disney|apple\.com|youtube premium|gym|membership|subscription)\b/i, category: "subscriptions" },
  { pattern: /\b(amazon|ebay|argos|john lewis|currys|ikea|primark|next |h&m|zara|asos)\b/i, category: "shopping" },
  { pattern: /\b(cinema|odeon|cineworld|vue|theatre|ticket|gig|concert|gaming|steam|playstation|xbox)\b/i, category: "entertainment" },
  { pattern: /\b(pharmacy|boots|superdrug|dentist|doctor|hospital|gym|fitness|pure gym|the gym)\b/i, category: "health" },
  { pattern: /\b(cash|atm|withdrawal|cashpoint)\b/i, category: "cash" },
  { pattern: /\b(transfer|standing order|direct debit)\b/i, category: "transfers" },
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

export function categorizeTransaction(
  description: string,
  amount: number,
  customRules?: CategoryRule[],
  subcategory?: string
): SpendingCategory {
  if (amount > 0) return "income";

  if (customRules) {
    for (const rule of customRules) {
      if (description.toLowerCase().includes(rule.pattern.toLowerCase())) {
        return rule.category;
      }
    }
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(description)) {
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
