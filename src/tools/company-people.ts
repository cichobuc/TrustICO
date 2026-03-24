/**
 * MCP tool: company_people
 *
 * Returns all people in a company — statutory bodies, shareholders,
 * equity capital, and manner of acting.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRpoAdapter as rpo } from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";

export function registerCompanyPeople(server: McpServer): void {
  server.tool(
    "company_people",
    "Všetky osoby vo firme — štatutári, spoločníci, vklady, spôsob konania. Vstup: 8-miestne IČO.",
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

      const people = rpo.mapPeople(entityResult.data);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            ...people,
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
