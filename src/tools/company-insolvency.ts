/**
 * MCP tools: company_insolvency, company_insolvency_notices, insolvency_detail
 *
 * Insolvenčné konania a oznamy z IS REPLIK.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedReplikAdapter as replik } from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";

export function registerCompanyInsolvency(server: McpServer): void {
  // --- company_insolvency ---
  server.tool(
    "company_insolvency",
    "Insolvenčné konania (konkurz, reštrukturalizácia, oddlženie) firmy z IS REPLIK. Vstup: 8-miestne IČO.",
    { ico: z.string().describe("8-miestne IČO firmy") },
    async ({ ico }) => {
      const validation = validateICO(ico);
      if (!validation.valid) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: validation.error,
              _meta: { source: "replik", durationMs: 0, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const result = await replik.getKonania(validation.normalized);

      if (result.error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: result.error,
              _meta: { source: "replik", durationMs: result.durationMs, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const response = {
        ...(result.data ?? { ico: validation.normalized, found: false, konania: [] }),
        _meta: {
          source: "replik",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );

  // --- company_insolvency_notices ---
  server.tool(
    "company_insolvency_notices",
    "Oznamy k insolvenčným konaniam firmy z IS REPLIK (uznesenia, výzvy, atď.). Vstup: 8-miestne IČO.",
    { ico: z.string().describe("8-miestne IČO firmy") },
    async ({ ico }) => {
      const validation = validateICO(ico);
      if (!validation.valid) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: validation.error,
              _meta: { source: "replik", durationMs: 0, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const result = await replik.getOznamy(validation.normalized);

      if (result.error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: result.error,
              _meta: { source: "replik", durationMs: result.durationMs, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const response = {
        ...(result.data ?? { ico: validation.normalized, found: false, oznamy: [] }),
        _meta: {
          source: "replik",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );

  // --- insolvency_detail ---
  server.tool(
    "insolvency_detail",
    "Detail konkrétneho insolvenčného konania z IS REPLIK podľa ID konania (vrátane udalostí, dlžníka, správcu). Vstup: ID konania.",
    { konanieId: z.string().max(100).describe("ID insolvenčného konania (napr. K-123/2024)") },
    async ({ konanieId }) => {
      // Basic input validation — prevent excessively long or suspicious input
      if (konanieId.length === 0 || konanieId.length > 100) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "Invalid konanieId: must be 1-100 characters",
              _meta: { source: "replik", durationMs: 0, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const result = await replik.getKonanieDetail(konanieId);

      if (result.error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: result.error,
              _meta: { source: "replik", durationMs: result.durationMs, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const response = {
        ...(result.data ?? { konanieId }),
        _meta: {
          source: "replik",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );
}
