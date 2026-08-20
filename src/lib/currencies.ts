export type CurrencyLanguage = "fr" | "en";

const zeroDecimalCurrencies = new Set(["XOF", "XAF", "JPY", "GNF", "CDF"]);

export const supportedCurrencies = [
  "XOF",
  "XAF",
  "EUR",
  "USD",
  "GBP",
  "CAD",
  "CHF",
  "GHS",
  "NGN",
  "GNF",
  "CDF",
  "MAD",
  "TND",
  "JPY",
  "CNY",
] as const;

const names: Record<(typeof supportedCurrencies)[number], Record<CurrencyLanguage, string>> = {
  XOF: { fr: "Franc CFA BCEAO", en: "West African CFA franc" },
  XAF: { fr: "Franc CFA BEAC", en: "Central African CFA franc" },
  EUR: { fr: "Euro", en: "Euro" },
  USD: { fr: "Dollar américain", en: "US dollar" },
  GBP: { fr: "Livre sterling", en: "Pound sterling" },
  CAD: { fr: "Dollar canadien", en: "Canadian dollar" },
  CHF: { fr: "Franc suisse", en: "Swiss franc" },
  GHS: { fr: "Cedi ghanéen", en: "Ghanaian cedi" },
  NGN: { fr: "Naira nigérian", en: "Nigerian naira" },
  GNF: { fr: "Franc guinéen", en: "Guinean franc" },
  CDF: { fr: "Franc congolais", en: "Congolese franc" },
  MAD: { fr: "Dirham marocain", en: "Moroccan dirham" },
  TND: { fr: "Dinar tunisien", en: "Tunisian dinar" },
  JPY: { fr: "Yen japonais", en: "Japanese yen" },
  CNY: { fr: "Yuan chinois", en: "Chinese yuan" },
};

export function currencyName(code: string, language: CurrencyLanguage) {
  return names[code as keyof typeof names]?.[language] ?? code;
}

export function currencyFractionDigits(code: string) {
  return zeroDecimalCurrencies.has(code) ? 0 : 2;
}

export function formatCurrencyAmount(value: string | number, code: string, language: CurrencyLanguage) {
  const fractionDigits = currencyFractionDigits(code);
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value));
}

export function normalizeCurrencyAmount(value: string, code: string) {
  const normalized = value.trim().replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(currencyFractionDigits(code));
}
