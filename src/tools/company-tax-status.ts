/**
 * MCP tool: company_tax_status
 *
 * Kompletný daňový status z Finančnej správy:
 * - DPH registrácia (ds_dphs)
 * - Daňový dlžník (ds_dsdd)
 * - DPH zrušenie (ds_dphz)
 * - DPH vymazanie (ds_dphv)
 * - Index daňovej spoľahlivosti (ds_ids)
 *
 * All 5 sub-queries run in parallel via Promise.allSettled.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedFinsprAdapter as finspr } from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";

export function registerCompanyTaxStatus(server: McpServer): void {
  server.tool(
    "company_tax_status",
    "Kompletný daňový status firmy z Finančnej správy SR — DPH registrácia, index spoľahlivosti, daňový dlžník. Vstup: 8-miestne IČO.",
    { ico: z.string().describe("8-miestne IČO firmy") },
    async ({ ico }) => {
      const start = Date.now();
      try {
      const validation = validateICO(ico);
      if (!validation.valid) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: validation.error,
              _meta: { source: "finspr", durationMs: 0, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const result = await finspr.getTaxStatus(validation.normalized);

      const { zdrojeStatus, ...taxData } = result.data ?? { ico: validation.normalized, zdrojeStatus: {} };

      const response = {
        ...taxData,
        _meta: {
          source: "finspr",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
          zdrojeStatus: zdrojeStatus ?? {},
        },
      };

      if (result.error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: result.error,
              _meta: {
                source: "finspr",
                durationMs: result.durationMs,
                timestamp: new Date().toISOString(),
              },
            }, null, 2),
          }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              _meta: { source: "finspr", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }
    },
  );
}
