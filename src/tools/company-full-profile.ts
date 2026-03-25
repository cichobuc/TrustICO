/**
 * MCP tool: company_full_profile
 *
 * Mega-profil zo VŠETKÝCH zdrojov naraz (paralelné volanie).
 * Input: 8-miestne IČO.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedFullProfile } from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";

export function registerCompanyFullProfile(server: McpServer): void {
  server.tool(
    "company_full_profile",
    "Kompletný profil firmy zo všetkých zdrojov (RPO, RegisterUZ, RPVS, Finančná správa, VIES, IS REPLIK, ITMS). Paralelné volanie, max 15s. Vstup: 8-miestne IČO.",
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
              _meta: { source: "full_profile", durationMs: 0, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }

      try {
        const result = await sharedFullProfile.getFullProfile(validation.normalized);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: err instanceof Error ? err.message : "Neočakávaná chyba pri získavaní profilu",
              _meta: { source: "full_profile", durationMs: 0, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }
    },
  );
}
