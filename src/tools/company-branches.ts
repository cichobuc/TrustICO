/**
 * MCP tool: company_branches
 *
 * Returns branches (prevádzkarne) and organizational units from RPO.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRpoAdapter as rpo } from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";

export function registerCompanyBranches(server: McpServer): void {
  server.tool(
    "company_branches",
    "Prevádzkarne a organizačné zložky firmy z RPO. Vstup: 8-miestne IČO.",
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
              _meta: { source: "rpo", durationMs: 0, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }

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

      const branches = rpo.mapBranches(entityResult.data);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            ...branches,
            _meta: {
              source: "rpo",
              durationMs: Date.now() - start,
              timestamp: new Date().toISOString(),
            },
          }, null, 2),
        }],
      };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              _meta: { source: "rpo", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }
    },
  );
}
