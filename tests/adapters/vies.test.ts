import { describe, it, expect } from "vitest";
import { ViesAdapter } from "../../src/adapters/vies.adapter.js";
import { HttpClient } from "../../src/utils/http-client.js";

const http = new HttpClient();
const adapter = new ViesAdapter(http);

describe("ViesAdapter", () => {
  it("checkVat returns valid result for known SK VAT number", async () => {
    // Websupport DIČ: 2022187026 → IČ DPH: SK2022187026
    const result = await adapter.checkVat("SK2022187026");

    expect(result.source).toBe("vies");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(typeof result.found).toBe("boolean");

    if (result.found && result.data) {
      expect(result.data).toHaveProperty("vatNumber");
      expect(result.data).toHaveProperty("valid");
      expect(result.data).toHaveProperty("nazov");
      expect(result.data).toHaveProperty("adresa");
      expect(result.data).toHaveProperty("datumOverenia");
      expect(typeof result.data.valid).toBe("boolean");
    }
  });

  it("checkVat handles invalid VAT number gracefully", async () => {
    const result = await adapter.checkVat("SK0000000000");

    expect(result.source).toBe("vies");
    expect(typeof result.found).toBe("boolean");
    // Should either be found=false or found=true with valid=false
    if (result.found && result.data) {
      expect(result.data.valid).toBe(false);
    }
  });
});
