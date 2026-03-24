/**
 * MCP tool: company_financials
 *
 * Účtovné závierky a kľúčové finančné dáta z RegisterUZ.
 * Input: IČO (8 číslic), optional year.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpClient } from "../utils/http-client.js";
import { RuzAdapter } from "../adapters/ruz.adapter.js";
import { RuzPipeline } from "../orchestrator/ruz-pipeline.js";
import { validateICO } from "../utils/validators.js";

const http = new HttpClient();
const adapter = new RuzAdapter(http);
const pipeline = new RuzPipeline(adapter);

export function registerCompanyFinancials(server: McpServer): void {
  server.tool(
    "company_financials",
    "Účtovné závierky a kľúčové finančné dáta z RegisterUZ. Vráti zoznam závierok, výkazy, prílohy a kľúčové ukazovatele (aktíva, tržby, zisk). Vstup: 8-miestne IČO.",
    {
      ico: z.string().describe("8-miestne IČO firmy"),
      year: z.number().optional().describe("Konkrétny rok (default: najnovšia závierka)"),
    },
    async ({ ico, year }) => {
      const start = Date.now();

      const validation = validateICO(ico);
      if (!validation.valid) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: validation.error }) }],
        };
      }

      try {
        const result = await pipeline.getFinancials(validation.normalized, year);

        if (!result.success || !result.data) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: result.error ?? "Nepodarilo sa získať finančné dáta",
                _meta: {
                  source: "ruz",
                  durationMs: result.durationMs,
                  timestamp: new Date().toISOString(),
                },
              }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              ...result.data,
              _meta: {
                source: "ruz",
                durationMs: result.durationMs,
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
              error: err instanceof Error ? err.message : "Neočakávaná chyba pri získavaní finančných dát",
              _meta: { source: "ruz", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }
    },
  );
}
