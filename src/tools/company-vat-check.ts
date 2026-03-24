/**
 * MCP tool: company_vat_check
 *
 * Overenie IČ DPH cez EU VIES REST API.
 * Accepts "SK2021869234", "2021869234", or just the 10-digit DIČ.
 * Auto-prefixes SK if no country code is present.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpClient } from "../utils/http-client.js";
import { ViesAdapter } from "../adapters/vies.adapter.js";

const http = new HttpClient();
const vies = new ViesAdapter(http);

export function registerCompanyVatCheck(server: McpServer): void {
  server.tool(
    "company_vat_check",
    "Overenie IČ DPH cez EU VIES — validita, názov a adresa firmy. Vstup: IČ DPH (napr. SK2021869234 alebo 2021869234, auto-prefix SK).",
    { vatNumber: z.string().describe("IČ DPH — napr. 'SK2021869234' alebo '2021869234' (auto-prefix SK)") },
    async ({ vatNumber }) => {
      const result = await vies.checkVat(vatNumber);

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
          content: [{ type: "text" as const, text: JSON.stringify({ error: result.error, ...response }, null, 2) }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );
}
