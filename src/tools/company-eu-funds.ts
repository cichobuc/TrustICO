/**
 * MCP tool: company_eu_funds
 *
 * Eurofondy z ITMS2014+ — best-effort search by IČO.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedItmsAdapter as itms } from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";

export function registerCompanyEuFunds(server: McpServer): void {
  server.tool(
    "company_eu_funds",
    "Eurofondy (ITMS2014+) — projekty financované z EÚ fondov pre danú firmu. Best-effort search, môže byť pomalší. Vstup: 8-miestne IČO.",
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
              _meta: { source: "itms", durationMs: 0, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const result = await itms.findPrijimatel(validation.normalized);

      if (result.error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: result.error,
              _meta: { source: "itms", durationMs: result.durationMs, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const response = {
        ...(result.data ?? { ico: validation.normalized, found: false, prijimatel: null, projekty: [], celkovaSuma: 0 }),
        _meta: {
          source: "itms",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
        },
      };

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
              _meta: { source: "itms", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }
    },
  );
}
