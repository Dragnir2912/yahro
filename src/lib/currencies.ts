export type CurrencyLanguage = "fr" | "en";

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
