import { describe, it, expect } from "vitest";
import { IcoResolver, detectQueryType } from "../../src/orchestrator/resolver.js";
import { HttpClient } from "../../src/utils/http-client.js";

const http = new HttpClient();
const resolver = new IcoResolver(http);

describe("detectQueryType", () => {
  it("detects IČO (8 digits)", () => {
    expect(detectQueryType("36421928")).toBe("ico");
  });

  it("detects DIČ (10 digits)", () => {
    expect(detectQueryType("2022187026")).toBe("dic");
  });

  it("detects DIČ with SK prefix", () => {
    expect(detectQueryType("SK2022187026")).toBe("dic");
  });

  it("detects name for non-numeric input", () => {
    expect(detectQueryType("Websupport")).toBe("name");
  });

  it("handles whitespace", () => {
    expect(detectQueryType("  36421928  ")).toBe("ico");
  });
});

describe("IcoResolver", () => {
  it("resolves IČO and returns ResolverResult structure", async () => {
    const result = await resolver.resolve("36421928");

    expect(result.queryType).toBe("ico");
    expect(result.source).toBe("rpo");
    expect(typeof result.durationMs).toBe("number");
    expect(Array.isArray(result.results)).toBe(true);

    if (result.results.length > 0) {
      const first = result.results[0];
      expect(first).toHaveProperty("ico");
      expect(first).toHaveProperty("nazov");
      expect(first).toHaveProperty("rpoId");
    }
  });

  it("resolves company name and returns ResolverResult structure", async () => {
    const result = await resolver.resolve("Websupport");

    expect(result.queryType).toBe("name");
    expect(result.source).toBe("rpo");
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("resolves non-existent IČO without throwing", async () => {
    const result = await resolver.resolve("00000001");

    expect(result.queryType).toBe("ico");
    expect(Array.isArray(result.results)).toBe(true);
  });
});
