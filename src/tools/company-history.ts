/**
 * MCP tool: company_history
 *
 * Returns history of changes — names, addresses, statutory bodies, shareholders.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRpoAdapter as rpo } from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";

export function registerCompanyHistory(server: McpServer): void {
  server.tool(
    "company_history",
    "História zmien firmy — zmeny názvov, adries, štatutárov, spoločníkov. Vstup: 8-miestne IČO.",
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
              _meta: { source: "rpo", durationMs: 0, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }

      const start = Date.now();
      const entityResult = await rpo.getEntityByIco(validation.normalized);

      if (!entityResult.found || !entityResult.data) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: entityResult.error ?? "Firma nebola nájdená",
              _meta: { source: "rpo", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }

      const history = rpo.mapHistory(entityResult.data);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            ...history,
            _meta: {
              source: "rpo",
              durationMs: Date.now() - start,
              timestamp: new Date().toISOString(),
            },
          }, null, 2),
        }],
      };
    },
  );
}
