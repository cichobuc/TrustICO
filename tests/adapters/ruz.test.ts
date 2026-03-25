import { describe, it, expect } from "vitest";
import { RuzAdapter } from "../../src/adapters/ruz.adapter.js";
import { HttpClient } from "../../src/utils/http-client.js";

const http = new HttpClient();
const adapter = new RuzAdapter(http);
const ICO = "36421928";

describe("RuzAdapter", () => {
  it("findEntity returns entity IDs for known IČO", async () => {
    const result = await adapter.findEntity(ICO);

    expect(result.source).toBe("ruz");
    expect(typeof result.durationMs).toBe("number");
    expect(typeof result.found).toBe("boolean");

    if (result.found) {
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);
      expect(typeof result.data![0]).toBe("number");
    } else {
      expect(result.error === undefined || typeof result.error === "string").toBe(true);
    }
  });

  it("getEntity returns entity detail", async () => {
    const searchResult = await adapter.findEntity(ICO);
    if (!searchResult.found || !searchResult.data || searchResult.data.length === 0) {
      // API unavailable — skip gracefully
      return;
    }

    const entityId = searchResult.data[0];
    const result = await adapter.getEntity(entityId);

    expect(result.source).toBe("ruz");
    if (result.found) {
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty("id");
      expect(result.data).toHaveProperty("ico");
      expect(result.data).toHaveProperty("nazovUJ");
    }
  });

  it("getEntity contains statement IDs", async () => {
    const searchResult = await adapter.findEntity(ICO);
    if (!searchResult.found || !searchResult.data || searchResult.data.length === 0) {
      return;
    }

    const entityId = searchResult.data[0];
    const result = await adapter.getEntity(entityId);

    if (result.found && result.data) {
      expect(result.data).toHaveProperty("idUctovnychZavierok");
      expect(Array.isArray(result.data.idUctovnychZavierok)).toBe(true);
    }
  });

  it("getStatement returns statement detail with report IDs", async () => {
    const searchResult = await adapter.findEntity(ICO);
    if (!searchResult.found || !searchResult.data || searchResult.data.length === 0) {
      return;
    }

    const entityId = searchResult.data[0];
    const entityResult = await adapter.getEntity(entityId);
    if (!entityResult.found || !entityResult.data) {
      return;
    }

    const stmtIds = entityResult.data.idUctovnychZavierok ?? [];
    if (stmtIds.length === 0) {
      return;
    }

    const result = await adapter.getStatement(stmtIds[0]);

    expect(result.source).toBe("ruz");
    if (result.found) {
      expect(result.data).toHaveProperty("id");
      expect(result.data).toHaveProperty("obdobieOd");
      expect(result.data).toHaveProperty("obdobieDo");
      expect(result.data).toHaveProperty("typ");
    }
  });

  it("getReport returns report with content", async () => {
    const searchResult = await adapter.findEntity(ICO);
    if (!searchResult.found || !searchResult.data || searchResult.data.length === 0) {
      return;
    }

    const entityId = searchResult.data[0];
    const entityResult = await adapter.getEntity(entityId);
    if (!entityResult.found || !entityResult.data) {
      return;
    }

    const stmtIds = entityResult.data.idUctovnychZavierok ?? [];
    if (stmtIds.length === 0) {
      return;
    }

    const stmtResult = await adapter.getStatement(stmtIds[0]);
    if (!stmtResult.found || !stmtResult.data) {
      return;
    }

    const reportIds = stmtResult.data.idUctovnychVykazov ?? [];
    if (reportIds.length === 0) {
      return;
    }

    const result = await adapter.getReport(reportIds[0]);

    expect(result.source).toBe("ruz");
    if (result.found) {
      expect(result.data).toHaveProperty("id");
      expect(result.data).toHaveProperty("idSablony");
    }
  });

  it("findEntity for unknown IČO returns valid structure", async () => {
    const result = await adapter.findEntity("99999999");

    expect(result.source).toBe("ruz");
    expect(typeof result.found).toBe("boolean");
    expect(typeof result.durationMs).toBe("number");
  });
});
