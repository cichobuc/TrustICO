import { describe, it, expect } from "vitest";
import { ReplikAdapter } from "../../src/adapters/replik.adapter.js";

const adapter = new ReplikAdapter();
const ICO = "36421928";

describe("ReplikAdapter", () => {
  it("getKonania returns result with correct structure", async () => {
    const result = await adapter.getKonania(ICO);

    expect(result.source).toBe("replik");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(typeof result.found).toBe("boolean");

    if (result.data) {
      expect(result.data).toHaveProperty("ico");
      expect(result.data).toHaveProperty("found");
      expect(result.data).toHaveProperty("konania");
      expect(Array.isArray(result.data.konania)).toBe(true);

      if (result.data.konania.length > 0) {
        const first = result.data.konania[0];
        expect(first).toHaveProperty("konanieId");
        expect(first).toHaveProperty("spisovaZnacka");
        expect(first).toHaveProperty("sud");
        expect(first).toHaveProperty("druhKonania");
        expect(first).toHaveProperty("stavKonania");
      }
    }
  });

  it("getOznamy returns result with correct structure", async () => {
    const result = await adapter.getOznamy(ICO);

    expect(result.source).toBe("replik");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(typeof result.found).toBe("boolean");

    if (result.data) {
      expect(result.data).toHaveProperty("ico");
      expect(result.data).toHaveProperty("found");
      expect(result.data).toHaveProperty("oznamy");
      expect(Array.isArray(result.data.oznamy)).toBe(true);
    }
  });

  it("handles non-existent IČO without throwing", async () => {
    const result = await adapter.getKonania("00000001");

    expect(result.source).toBe("replik");
    expect(typeof result.found).toBe("boolean");
    // Should not throw — graceful degradation
  });
});
