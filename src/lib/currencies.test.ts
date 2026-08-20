import { describe, expect, it } from "vitest";
import { currencyFractionDigits, currencyName, formatCurrencyAmount, normalizeCurrencyAmount, supportedCurrencies } from "./currencies";

describe("currency labels", () => {
  it("uses familiar localized names while preserving ISO values internally", () => {
    expect(currencyName("XOF", "fr")).toBe("Franc CFA BCEAO");
    expect(currencyName("USD", "fr")).toBe("Dollar américain");
    expect(currencyName("GBP", "en")).toBe("Pound sterling");
    expect(supportedCurrencies).toContain("EUR");
  });

  it("falls back safely for a currency not yet catalogued", () => {
    expect(currencyName("AUD", "fr")).toBe("AUD");
  });

  it("does not invent decimals for zero-decimal currencies", () => {
    expect(currencyFractionDigits("XOF")).toBe(0);
    expect(normalizeCurrencyAmount("1250,9", "XOF")).toBe("1251");
    expect(formatCurrencyAmount(1250, "XOF", "fr")).not.toContain(",00");
  });

  it("keeps two decimals for currencies that use cents", () => {
    expect(currencyFractionDigits("EUR")).toBe(2);
    expect(normalizeCurrencyAmount("12,5", "EUR")).toBe("12.50");
  });
});
