import { describe, expect, test } from "bun:test";
import { checkPiVendor } from "./check-pi-vendor.mjs";

describe("Pi vendor integrity", () => {
  test("matches the pinned commit documentation and vendored package closure", async () => {
    const result = await checkPiVendor();
    expect(result.pinned).toMatch(/^[0-9a-f]{40}$/u);
    expect(result.packages).toHaveLength(7);
  });
});
