import { describe, it, expect } from "vitest";
import { FinsprAdapter } from "../../src/adapters/finspr.adapter.js";
import { HttpClient } from "../../src/utils/http-client.js";
import "dotenv/config";

const http = new HttpClient();
const adapter = new FinsprAdapter(http);
const ICO = "36421928";

const hasApiKey = !!process.env.FINSPR_API_KEY;

describe("FinsprAdapter", () => {
  it.skipIf(!hasApiKey)("getDph returns result with correct structure", async () => {
    const result = await adapter.getDph(ICO);

    expect(result.source).toBe("finspr");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(typeof result.found).toBe("boolean");

    if (result.found && result.data) {
      expect(Array.isArray(result.data)).toBe(true);
      const row = result.data[0];
      expect(row).toHaveProperty("ico");
    }
  });

  it.skipIf(!hasApiKey)("getTaxStatus returns aggregated structure", async () => {
    const result = await adapter.getTaxStatus(ICO);

    expect(result.source).toBe("finspr");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(typeof result.found).toBe("boolean");

    if (result.data) {
      expect(result.data).toHaveProperty("ico");
      expect(result.data).toHaveProperty("dph");
      expect(result.data).toHaveProperty("indexSpolahlivosti");
      expect(result.data).toHaveProperty("danovyDlznik");
      expect(result.data).toHaveProperty("zdrojeStatus");

      expect(result.data.dph).toHaveProperty("registrovany");
      expect(typeof result.data.dph.registrovany).toBe("boolean");
      expect(typeof result.data.danovyDlznik).toBe("boolean");
    }
  });

  it.skipIf(!hasApiKey)("getDlznici returns result", async () => {
    const result = await adapter.getDlznici(ICO);

    expect(result.source).toBe("finspr");
    expect(typeof result.found).toBe("boolean");
    if (result.data) {
      expect(Array.isArray(result.data)).toBe(true);
    }
  });

  it("returns error when API key is missing", async () => {
    const adapterNoKey = new FinsprAdapter(http, "");
    const result = await adapterNoKey.getDph(ICO);

    expect(result.found).toBe(false);
    expect(result.error).toContain("FINSPR_API_KEY");
  });
});
