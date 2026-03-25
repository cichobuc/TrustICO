/**
 * MCP tool: verify_company_id
 *
 * Rýchle overenie IČO cez dva zdroje:
 *   1. ŠÚSR RPO — existencia firmy, názov, sídlo, stav (aktívna/zrušená)
 *   2. RegisterUZ — účtovné závierky a ich prílohy (poznámky, skeny)
 *
 * Oba zdroje sa volajú paralelne cez Promise.allSettled,
 * takže ak jeden padne, druhý stále vráti výsledok (graceful degradation).
 *
 * Typický use-case:
 *   - "Existuje firma s IČO 53642449?"
 *   - "Má firma nejaké prílohy v registri účtovných závierok?"
 *
 * Ak chcete stiahnuť konkrétnu prílohu, použite tool `financial_attachment`
 * s `attachmentId` z výstupu tohto toolu.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  sharedRpoAdapter as rpoAdapter,
  sharedRuzPipeline as ruzPipeline,
} from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";
import type { CompanySearchResult } from "../types/rpo.types.js";

/** Single attachment enriched with zavierka context. */
interface PrilohaWithContext {
  zavierkaId: number;
  obdobie: string;
  id: number;
  nazov: string | null;
  velkost: number | null;
  strany: number | null;
}

export function registerVerifyCompanyId(server: McpServer): void {
  server.tool(
    "verify_company_id",
    "Overí IČO v RPO (existencia, názov, sídlo, stav) a skontroluje prílohy (poznámky k závierke, skeny) v RegisterUZ. Pre stiahnutie konkrétnej prílohy použite financial_attachment s attachmentId z výstupu.",
    {
      ico: z.string().describe("8-miestne IČO firmy"),
    },
    async ({ ico }) => {
      const start = Date.now();

      // --- Validácia vstupu ---
      const validation = validateICO(ico);
      if (!validation.valid) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: validation.error,
              _meta: { source: "rpo+ruz", durationMs: 0, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const normalizedIco = validation.normalized;

      try {
        // --- Paralelné volanie RPO + RUZ ---
        const [rpoSettled, ruzSettled] = await Promise.allSettled([
          rpoAdapter.search(normalizedIco),
          ruzPipeline.getFinancials(normalizedIco),
        ]);

        // RPO result
        const rpoResult = rpoSettled.status === "fulfilled" ? rpoSettled.value : null;
        const rpoError = rpoSettled.status === "rejected"
          ? (rpoSettled.reason instanceof Error ? rpoSettled.reason.message : String(rpoSettled.reason))
          : rpoResult?.error ?? null;
        const companyInfo: CompanySearchResult | null =
          rpoResult?.found && rpoResult.data && rpoResult.data.length > 0
            ? rpoResult.data[0]
            : null;

        // RUZ result
        const ruzResult = ruzSettled.status === "fulfilled" ? ruzSettled.value : null;
        const ruzError = ruzSettled.status === "rejected"
          ? (ruzSettled.reason instanceof Error ? ruzSettled.reason.message : String(ruzSettled.reason))
          : ruzResult?.error ?? null;

        // --- Zbieranie príloh zo všetkých závierok ---
        const prilohy: PrilohaWithContext[] = [];
        if (ruzResult?.success && ruzResult.data) {
          for (const zavierka of ruzResult.data.zavierky) {
            const obdobie = zavierka.obdobieDo
              ? `${zavierka.obdobieOd ?? "?"} – ${zavierka.obdobieDo}`
              : zavierka.obdobieOd ?? "neznáme";

            for (const priloha of zavierka.prilohy ?? []) {
              prilohy.push({
                zavierkaId: zavierka.id,
                obdobie,
                id: priloha.id,
                nazov: priloha.nazov,
                velkost: priloha.velkost,
                strany: priloha.strany,
              });
            }
          }
        }

        const durationMs = Date.now() - start;

        // --- Oba zdroje zlyhali (explicitná kontrola chýb, nie len absencia dát) ---
        if (!companyInfo && rpoError && !(ruzResult?.success)) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: `Firma s IČO ${normalizedIco} nebola nájdená v RPO ani RegisterUZ`,
                rpoError,
                ruzError,
                _meta: { source: "rpo+ruz", durationMs, timestamp: new Date().toISOString() },
              }, null, 2),
            }],
          };
        }

        // --- Úspešný výsledok ---
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              ico: normalizedIco,
              firma: {
                najdena: companyInfo != null,
                nazov: companyInfo?.nazov ?? null,
                sidlo: companyInfo?.sidlo ?? null,
                pravnaForma: companyInfo?.pravnaForma ?? null,
                datumVzniku: companyInfo?.datumVzniku ?? null,
                aktivna: companyInfo?.aktivna ?? null,
                zdroj: "rpo",
                ...(rpoError ? { chyba: rpoError } : {}),
              },
              registerUZ: {
                najdena: ruzResult?.success === true && ruzResult.data != null,
                pocetZavierok: ruzResult?.data?.zavierky?.length ?? 0,
                uctovnaJednotka: ruzResult?.data?.uctovnaJednotka ?? null,
                ...(ruzError ? { chyba: ruzError } : {}),
              },
              prilohy: {
                pocet: prilohy.length,
                zoznam: prilohy,
              },
              _meta: {
                source: "rpo+ruz",
                durationMs,
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
              error: err instanceof Error ? err.message : "Neočakávaná chyba pri overovaní IČO",
              _meta: { source: "rpo+ruz", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }
    },
  );
}
