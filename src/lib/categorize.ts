import { SpendingCategory } from "./types";

const CATEGORY_RULES: Array<{ pattern: RegExp; category: SpendingCategory }> = [
  // Income
  { pattern: /\b(salary|wages|payroll|bacs credit)\b/i, category: "income" },

  // Groceries
  {
    pattern:
      /\b(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co-op|ocado|iceland|m&s food|marks.spencer)\b/i,
    category: "groceries",
  },

  // Eating out
  {
    pattern:
      /\b(mcdonald|burger king|kfc|nando|greggs|costa|starbucks|pret|deliveroo|uber eats|just eat|domino|pizza|restaurant|cafe|coffee)\b/i,
    category: "eating-out",
  },

  // Transport
  {
    pattern:
      /\b(tfl|transport for london|trainline|national rail|uber|bolt|parking|fuel|petrol|shell|bp|esso|dart charge|congestion|bus)\b/i,
    category: "transport",
  },

  // Bills
  {
    pattern:
      /\b(council tax|water|electric|gas|british gas|edf|eon|octopus energy|thames water|virgin media|bt |sky |broadband|internet|rent|mortgage|insurance)\b/i,
    category: "bills",
  },

  // Subscriptions
  {
    pattern:
      /\b(netflix|spotify|amazon prime|disney|apple\.com|youtube premium|gym|membership|subscription)\b/i,
    category: "subscriptions",
  },

  // Shopping
  {
    pattern:
      /\b(amazon|ebay|argos|john lewis|currys|ikea|primark|next |h&m|zara|asos)\b/i,
    category: "shopping",
  },

  // Entertainment
  {
    pattern:
      /\b(cinema|odeon|cineworld|vue|theatre|ticket|gig|concert|gaming|steam|playstation|xbox)\b/i,
    category: "entertainment",
  },

  // Health
  {
    pattern:
      /\b(pharmacy|boots|superdrug|dentist|doctor|hospital|gym|fitness|pure gym|the gym)\b/i,
    category: "health",
  },

  // Cash
  { pattern: /\b(cash|atm|withdrawal|cashpoint)\b/i, category: "cash" },

  // Transfers
  {
    pattern: /\b(transfer|standing order|direct debit)\b/i,
    category: "transfers",
  },
];

export function categorizeTransaction(description: string, amount: number): SpendingCategory {
  if (amount > 0) return "income";

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(description)) {
      return rule.category;
    }
  }

  return "other";
}
