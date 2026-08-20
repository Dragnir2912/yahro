import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins only truthy class names", () => {
    expect(cn("card", false, undefined, "active", null)).toBe("card active");
  });
});
