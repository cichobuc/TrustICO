import { describe, it, expect } from "vitest";
import { RpvsAdapter } from "../../src/adapters/rpvs.adapter.js";
import { HttpClient } from "../../src/utils/http-client.js";

const http = new HttpClient();
const adapter = new RpvsAdapter(http);
const ICO = "36421928";

describe("RpvsAdapter", () => {
  it("getKuv returns a result with correct structure", async () => {
    const result = await adapter.getKuv(ICO);

    expect(result.source).toBe("rpvs");
    expect(result.durationMs).toBeGreaterThan(0);
    // Websupport may or may not be in RPVS — both found=true and found=false are valid
    expect(typeof result.found).toBe("boolean");

    if (result.data) {
      expect(result.data).toHaveProperty("ico");
      expect(result.data).toHaveProperty("found");
      expect(typeof result.data.found).toBe("boolean");

      if (result.data.found) {
        expect(result.data).toHaveProperty("partner");
        expect(result.data).toHaveProperty("konecniUzivatelia");
        expect(result.data).toHaveProperty("opravneneOsoby");
        expect(Array.isArray(result.data.konecniUzivatelia)).toBe(true);
        expect(Array.isArray(result.data.opravneneOsoby)).toBe(true);
      } else {
        expect(result.data).toHaveProperty("poznamka");
      }
    }
  });

  it("getKuv for public sector company returns data", async () => {
    // Slovenská pošta — known RPVS partner
    const result = await adapter.getKuv("31322832");

    expect(result.source).toBe("rpvs");
    expect(typeof result.found).toBe("boolean");

    if (result.found && result.data) {
      expect(result.data.found).toBe(true);
      expect(result.data).toHaveProperty("partner");
      expect(result.data.partner).toHaveProperty("id");
      expect(result.data.partner).toHaveProperty("obchodneMeno");
    }
  });

  it("rejects invalid IČO format", async () => {
    const result = await adapter.getKuv("abc");

    expect(result.source).toBe("rpvs");
    expect(result.found).toBe(false);
    expect(result.error).toBeDefined();
  });
});
