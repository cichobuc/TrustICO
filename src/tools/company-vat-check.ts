/**
 * MCP tool: company_vat_check
 *
 * Overenie IČ DPH cez EU VIES REST API.
 * Accepts "SK2021869234", "2021869234", or just the 10-digit DIČ.
 * Auto-prefixes SK if no country code is present.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedViesAdapter as vies } from "./_shared-clients.js";
import { validateICDPH } from "../utils/validators.js";

export function registerCompanyVatCheck(server: McpServer): void {
  server.tool(
    "company_vat_check",
    "Overenie IČ DPH cez EU VIES — validita, názov a adresa firmy. Vstup: IČ DPH (napr. SK2021869234 alebo 2021869234, auto-prefix SK).",
    { vatNumber: z.string().describe("IČ DPH — napr. 'SK2021869234' alebo '2021869234' (auto-prefix SK)") },
    async ({ vatNumber }) => {
      const start = Date.now();
      try {
      const validation = validateICDPH(vatNumber);
      if (!validation.valid) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: validation.error,
              _meta: { source: "vies", durationMs: 0, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const result = await vies.checkVat(validation.normalized);

      const response = {
        ...(result.data ?? { vatNumber, valid: false }),
        _meta: {
          source: "vies",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
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
                source: "vies",
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
              _meta: { source: "vies", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }
    },
  );
}
