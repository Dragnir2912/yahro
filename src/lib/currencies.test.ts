import { describe, expect, it } from "vitest";
import { currencyName, supportedCurrencies } from "./currencies";

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
});
