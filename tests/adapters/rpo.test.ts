import { describe, it, expect } from "vitest";
import { RpoAdapter } from "../../src/adapters/rpo.adapter.js";
import { HttpClient } from "../../src/utils/http-client.js";

const http = new HttpClient();
const adapter = new RpoAdapter(http);
const ICO = "36421928";

describe("RpoAdapter", () => {
  it("search by IČO returns AdapterResult structure", async () => {
    const result = await adapter.search(ICO);

    expect(result.source).toBe("rpo");
    expect(typeof result.durationMs).toBe("number");
    expect(typeof result.found).toBe("boolean");

    if (result.found) {
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);

      const first = result.data![0];
      expect(first).toHaveProperty("ico");
      expect(first).toHaveProperty("nazov");
      expect(first).toHaveProperty("sidlo");
      expect(first).toHaveProperty("aktivna");
      expect(first).toHaveProperty("rpoId");
      expect(typeof first.rpoId).toBe("number");
    } else {
      // API may be down — error should be a string
      expect(result.error === undefined || typeof result.error === "string").toBe(true);
    }
  });

  it("searchByName returns AdapterResult structure", async () => {
    const result = await adapter.searchByName("Websupport");

    expect(result.source).toBe("rpo");
    expect(typeof result.found).toBe("boolean");

    if (result.found) {
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);
      expect(result.data![0]).toHaveProperty("ico");
      expect(result.data![0]).toHaveProperty("nazov");
    }
  });

  it("getEntityByIco returns AdapterResult structure", async () => {
    const result = await adapter.getEntityByIco(ICO);

    expect(result.source).toBe("rpo");
    expect(typeof result.durationMs).toBe("number");
    expect(typeof result.found).toBe("boolean");

    if (result.found && result.data) {
      expect(result.data).toHaveProperty("id");
      expect(result.data).toHaveProperty("fullNames");
      expect(result.data).toHaveProperty("identifiers");
      expect(result.data).toHaveProperty("addresses");
      expect(Array.isArray(result.data.fullNames)).toBe(true);
      expect(Array.isArray(result.data.identifiers)).toBe(true);

      // Test mapPeople on the same entity
      const people = adapter.mapPeople(result.data);
      expect(people).toHaveProperty("ico");
      expect(people).toHaveProperty("nazov");
      expect(people).toHaveProperty("statutari");
      expect(people).toHaveProperty("spolocnici");
      expect(people).toHaveProperty("sposobKonania");
      expect(people).toHaveProperty("zakladneImanie");
      expect(Array.isArray(people.statutari)).toBe(true);
      expect(Array.isArray(people.spolocnici)).toBe(true);

      // Test mapHistory
      const history = adapter.mapHistory(result.data);
      expect(history).toHaveProperty("ico");
      expect(history).toHaveProperty("zmenyNazvov");
      expect(Array.isArray(history.zmenyNazvov)).toBe(true);

      // Test mapBranches
      const branches = adapter.mapBranches(result.data);
      expect(branches).toHaveProperty("ico");
      expect(branches).toHaveProperty("prevadzkarne");
      expect(branches).toHaveProperty("pocet");
      expect(Array.isArray(branches.prevadzkarne)).toBe(true);
    }
  });

  it("search for non-existent IČO returns valid structure", async () => {
    const result = await adapter.search("00000001");

    expect(result.source).toBe("rpo");
    expect(typeof result.found).toBe("boolean");
    expect(typeof result.durationMs).toBe("number");
  });
});
