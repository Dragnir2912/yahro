import { describe, expect, it } from "vitest";
import { aggregateMonthlyCashFlow } from "./dashboard";

describe("monthly cash-flow aggregation", () => {
  it("combines daily values into six chronological month buckets", () => {
    const result = aggregateMonthlyCashFlow([
      { day: "2026-03-02", currency: "XOF", income: "100", expense: "20" },
      { day: "2026-03-28", currency: "XOF", income: "50", expense: "10" },
      { day: "2026-04-05", currency: "XOF", income: "0", expense: "25" },
      { day: "2026-04-06", currency: "EUR", income: "999", expense: "999" },
    ], "XOF", "fr", 6, new Date("2026-08-20T00:00:00.000Z"));

    expect(result).toHaveLength(6);
    expect(result.map((item) => [item.income, item.expenses])).toEqual([
      [150, 30],
      [0, 25],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });
});
