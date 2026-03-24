/**
 * MCP tool: company_kuv
 *
 * Koneční užívatelia výhod z RPVS (Register partnerov verejného sektora).
 * Most companies are NOT in the register — only public sector partners.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRpvsAdapter as rpvs } from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";

export function registerCompanyKuv(server: McpServer): void {
  server.tool(
    "company_kuv",
    "Koneční užívatelia výhod (KÚV) a oprávnené osoby z Registra partnerov verejného sektora. Väčšina firiem NIE JE v registri. Vstup: 8-miestne IČO.",
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
              _meta: { source: "rpvs", durationMs: 0, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }

      const result = await rpvs.getKuv(validation.normalized);

      const response = {
        ...(result.data ?? { ico: validation.normalized, found: false }),
        _meta: {
          source: "rpvs",
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
                source: "rpvs",
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
    },
  );
}
