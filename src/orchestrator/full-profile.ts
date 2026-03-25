/**
 * Full Profile Orchestrator — fetches ALL data sources in parallel,
 * merges into a single company profile.
 *
 * Strategy:
 * 1. Run RPO, RUZ, RPVS, FinSpr, REPLIK, ITMS in parallel (Promise.allSettled)
 * 2. Extract DIČ from RPO/RUZ/FinSpr results
 * 3. If DIČ available and time remains, run VIES
 * 4. Merge everything into one profile with _meta.zdrojeStatus
 *
 * Overall timeout: 15s
 */

import type { RpoAdapter } from "../adapters/rpo.adapter.js";
import type { RuzPipeline } from "./ruz-pipeline.js";
import type { RpvsAdapter } from "../adapters/rpvs.adapter.js";
import type { FinsprAdapter } from "../adapters/finspr.adapter.js";
import type { ViesAdapter } from "../adapters/vies.adapter.js";
import type { ReplikAdapter } from "../adapters/replik.adapter.js";
import type { ItmsAdapter } from "../adapters/itms.adapter.js";
import type { RpoEntityDetail } from "../types/rpo.types.js";
import type { AdapterResult } from "../types/common.types.js";

const OVERALL_TIMEOUT_MS = 15_000;

export type ZdrojStatusEntry = {
  status: "ok" | "error" | "not_found" | "timeout";
  durationMs: number;
  error?: string;
};

export type FullProfileResult = {
  zakladneUdaje: {
    ico: string;
    dic: string | null;
    icDph: string | null;
    nazov: string;
    sidlo: { ulica: string | null; mesto: string | null; psc: string | null } | null;
    pravnaForma: { kod: string | null; nazov: string | null } | null;
    datumVzniku: string | null;
    datumZaniku: string | null;
    registrovySud: string | null;
    spisovaZnacka: string | null;
    predmetyPodnikania: string[];
    skNace: string | null;
  };
  statutari: Array<{
    meno: string | null;
    priezvisko: string | null;
    funkcia: string | null;
    od: string | null;
    do: string | null;
    adresa: string | null;
  }>;
  spolocnici: Array<{
    nazov: string;
    vklad: number | null;
    splateny: number | null;
    mena: string | null;
    od: string | null;
  }>;
  sposobKonania: string | null;
  financie: {
    poslednaZavierka: {
      obdobie: string | null;
      typ: string | null;
      datumPodania: string | null;
    } | null;
    klucoveUkazovatele: {
      trzby: number | null;
      zisk: number | null;
      aktiva: number | null;
      vlastneImanie: number | null;
      zadlzenost: number | null;
      roa: number | null;
    };
    pocetZavierok: number;
    idNajnovsejZavierky: number | null;
  };
  dph: {
    registrovany: boolean;
    icDph: string | null;
    paragraf: string | null;
    vymazany: boolean;
    dovodyZrusenia: string | null;
  };
  danovaSpolahlivost: {
    index: string | null;
  };
  danovyDlznik: boolean;
  insolvencia: {
    found: boolean;
    konania: Array<{
      konanieId: string;
      spisovaZnacka: string | null;
      sud: string | null;
      druhKonania: string | null;
      stavKonania: string | null;
      datumZaciatku: string | null;
    }>;
  };
  kuv: {
    found: boolean;
    poznamka?: string;
  };
  eurofondy: {
    found: boolean;
    projekty: Array<unknown>;
  };
  vies: {
    valid: boolean | null;
    nazov: string | null;
    adresa: string | null;
  } | null;
  _meta: {
    zdrojeStatus: Record<string, ZdrojStatusEntry>;
    totalDurationMs: number;
    timestamp: string;
  };
};

export class FullProfileOrchestrator {
  constructor(
    private readonly rpo: RpoAdapter,
    private readonly ruzPipeline: RuzPipeline,
    private readonly rpvs: RpvsAdapter,
    private readonly finspr: FinsprAdapter,
    private readonly vies: ViesAdapter,
    private readonly replik: ReplikAdapter,
    private readonly itms: ItmsAdapter,
  ) {}

  async getFullProfile(ico: string): Promise<FullProfileResult> {
    const start = Date.now();
    const zdrojeStatus: Record<string, ZdrojStatusEntry> = {};

    // Phase 1: Run all non-VIES sources in parallel with timeout race
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), OVERALL_TIMEOUT_MS),
    );

    const [rpoSettled, ruzSettled, rpvsSettled, finsprSettled, replikSettled, itmsSettled] =
      await Promise.allSettled([
        Promise.race([this.rpo.getEntityByIco(ico), timeoutPromise]),
        Promise.race([this.ruzPipeline.getFinancials(ico), timeoutPromise]),
        Promise.race([this.rpvs.getKuv(ico), timeoutPromise]),
        Promise.race([this.finspr.getTaxStatus(ico), timeoutPromise]),
        Promise.race([this.replik.getKonania(ico), timeoutPromise]),
        Promise.race([this.itms.findPrijimatel(ico), timeoutPromise]),
      ]);

    // --- Extract RPO ---
    const rpoResult = unwrap<AdapterResult<RpoEntityDetail>>(rpoSettled);
    if (rpoResult && rpoResult.found && rpoResult.data) {
      zdrojeStatus.rpo = { status: "ok", durationMs: rpoResult.durationMs };
    } else {
      zdrojeStatus.rpo = settledToStatus(rpoSettled, rpoResult);
    }

    const entity = rpoResult?.data;
    const people = entity ? this.rpo.mapPeople(entity) : null;

    // --- Extract RUZ ---
    const ruzResult = unwrap<{ success: boolean; data?: { uctovnaJednotka: { dic: string | null }; zavierky: Array<{ id: number; obdobieOd: string | null; obdobieDo: string | null; typ: string | null; datumPodania: string | null }>; klucoveUkazovatele: { aktivaCelkom: number | null; vlastneImanie: number | null; trzby: number | null; vysledokHospodarenia: number | null; zadlzenost: number | null; roa: number | null } }; error?: string; durationMs: number }>(ruzSettled);
    if (ruzResult && ruzResult.success && ruzResult.data) {
      zdrojeStatus.ruz = { status: "ok", durationMs: ruzResult.durationMs };
    } else {
      zdrojeStatus.ruz = settledToStatus(ruzSettled, ruzResult ? { found: ruzResult.success, durationMs: ruzResult.durationMs, error: ruzResult.error, source: "ruz" } : null);
    }

    // --- Extract RPVS ---
    const rpvsResult = unwrap<AdapterResult<{ ico: string; found: boolean; poznamka?: string }>>(rpvsSettled);
    if (rpvsResult) {
      zdrojeStatus.rpvs = rpvsResult.found && rpvsResult.data?.found
        ? { status: "ok", durationMs: rpvsResult.durationMs }
        : { status: rpvsResult.data?.found === false ? "not_found" : "error", durationMs: rpvsResult.durationMs, error: rpvsResult.error };
    } else {
      zdrojeStatus.rpvs = settledToStatus(rpvsSettled, null);
    }

    // --- Extract FinSpr ---
    const finsprResult = unwrap<AdapterResult<{ ico: string; dph: { registrovany: boolean; icDph: string | null; paragraf: string | null; datumRegistracie: string | null; vymazany: boolean; dovodyZrusenia: string | null }; indexSpolahlivosti: string | null; danovyDlznik: boolean }>>(finsprSettled);
    if (finsprResult && finsprResult.found && finsprResult.data) {
      zdrojeStatus.finspr = { status: "ok", durationMs: finsprResult.durationMs };
    } else {
      zdrojeStatus.finspr = settledToStatus(finsprSettled, finsprResult);
    }

    // --- Extract REPLIK ---
    const replikResult = unwrap<AdapterResult<{ ico: string; found: boolean; konania: Array<{ konanieId: string; spisovaZnacka: string | null; sud: string | null; druhKonania: string | null; stavKonania: string | null; datumZaciatku: string | null; datumUkoncenia: string | null }> }>>(replikSettled);
    if (replikResult) {
      zdrojeStatus.replik = replikResult.found
        ? { status: "ok", durationMs: replikResult.durationMs }
        : { status: replikResult.error ? "error" : "not_found", durationMs: replikResult.durationMs, error: replikResult.error };
    } else {
      zdrojeStatus.replik = settledToStatus(replikSettled, null);
    }

    // --- Extract ITMS ---
    const itmsResult = unwrap<AdapterResult<{ ico: string; found: boolean; projekty: Array<unknown> }>>(itmsSettled);
    if (itmsResult) {
      zdrojeStatus.itms = itmsResult.found
        ? { status: "ok", durationMs: itmsResult.durationMs }
        : { status: "not_found", durationMs: itmsResult.durationMs };
    } else {
      zdrojeStatus.itms = settledToStatus(itmsSettled, null);
    }

    // Phase 2: VIES — needs DIČ from RPO/RUZ/FinSpr
    const dic = finsprResult?.data?.dph?.icDph
      ?? ruzResult?.data?.uctovnaJednotka?.dic
      ?? null;

    let viesData: { valid: boolean | null; nazov: string | null; adresa: string | null } | null = null;
    const elapsed = Date.now() - start;
    if (dic && elapsed < OVERALL_TIMEOUT_MS - 2000) {
      // We have DIČ and enough time remaining
      const vatNumber = dic.startsWith("SK") ? dic : `SK${dic}`;
      try {
        const remaining = OVERALL_TIMEOUT_MS - elapsed;
        const viesResult = await Promise.race([
          this.vies.checkVat(vatNumber),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), remaining)),
        ]);
        if (viesResult.found && viesResult.data) {
          zdrojeStatus.vies = { status: "ok", durationMs: viesResult.durationMs };
          viesData = {
            valid: viesResult.data.valid,
            nazov: viesResult.data.nazov,
            adresa: viesResult.data.adresa,
          };
        } else {
          zdrojeStatus.vies = { status: "error", durationMs: viesResult.durationMs, error: viesResult.error };
        }
      } catch (err) {
        const isTimeout = err instanceof Error && err.message === "TIMEOUT";
        zdrojeStatus.vies = { status: isTimeout ? "timeout" : "error", durationMs: Date.now() - start - elapsed, error: isTimeout ? "Overall timeout" : String(err) };
      }
    } else if (!dic) {
      zdrojeStatus.vies = { status: "not_found", durationMs: 0, error: "DIČ nedostupné — nemožno overiť VIES" };
    } else {
      zdrojeStatus.vies = { status: "timeout", durationMs: 0, error: "Nedostatok času na VIES overenie" };
    }

    // --- Build zakladneUdaje from RPO entity ---
    const currentName = entity?.fullNames?.find((n) => !n.validTo)?.value
      ?? entity?.fullNames?.[0]?.value ?? "";
    const currentAddr = entity?.addresses?.find((a) => !a.validTo) ?? entity?.addresses?.[0];
    const currentLf = entity?.legalForms?.find((l) => !l.validTo) ?? entity?.legalForms?.[0];
    const sourceReg = entity?.sourceRegister;

    const zakladneUdaje = {
      ico,
      dic: finsprResult?.data?.dph?.icDph
        ? finsprResult.data.dph.icDph.replace(/^SK/, "")
        : ruzResult?.data?.uctovnaJednotka?.dic ?? null,
      icDph: finsprResult?.data?.dph?.icDph ?? null,
      nazov: currentName,
      sidlo: currentAddr
        ? {
            ulica: [currentAddr.street, currentAddr.buildingNumber].filter(Boolean).join(" ") || null,
            mesto: typeof currentAddr.municipality === "object" ? (currentAddr.municipality as { value: string })?.value ?? null : null,
            psc: currentAddr.postalCodes?.[0] ?? null,
          }
        : null,
      pravnaForma: currentLf
        ? { kod: currentLf.value?.code ?? null, nazov: currentLf.value?.value ?? null }
        : null,
      datumVzniku: entity?.establishment ?? null,
      datumZaniku: null as string | null,
      registrovySud: sourceReg?.registrationOffices?.[0]?.value ?? null,
      spisovaZnacka: sourceReg?.registrationNumbers?.[0]?.value ?? null,
      predmetyPodnikania: (entity?.activities ?? [])
        .filter((a) => !a.validTo)
        .map((a) => a.economicActivityDescription),
      skNace: entity?.statisticalCodes?.mainActivity?.code
        ?? (ruzResult?.data?.uctovnaJednotka as { skNace?: string | null } | undefined)?.skNace
        ?? null,
    };

    // --- Build statutari ---
    const statutari = (people?.statutari ?? []).map((s) => ({
      meno: s.meno,
      priezvisko: s.priezvisko,
      funkcia: s.typ,
      od: s.od,
      do: s.do,
      adresa: s.adresa
        ? [s.adresa.ulica, s.adresa.psc, s.adresa.mesto].filter(Boolean).join(", ")
        : null,
    }));

    // --- Build spolocnici ---
    const spolocnici = (people?.spolocnici ?? []).map((s) => ({
      nazov: s.nazov,
      vklad: s.vklad?.suma ?? null,
      splateny: s.vklad?.splateny ?? null,
      mena: s.vklad?.mena ?? null,
      od: s.od,
    }));

    // --- Build financie ---
    const ruzData = ruzResult?.data;
    const zavierky = ruzData?.zavierky ?? [];
    const latestZavierka = zavierky[0] ?? null;
    const ukazovatele = ruzData?.klucoveUkazovatele;

    const financie = {
      poslednaZavierka: latestZavierka
        ? {
            obdobie: latestZavierka.obdobieOd && latestZavierka.obdobieDo
              ? `${latestZavierka.obdobieOd} — ${latestZavierka.obdobieDo}`
              : null,
            typ: latestZavierka.typ,
            datumPodania: latestZavierka.datumPodania,
          }
        : null,
      klucoveUkazovatele: {
        trzby: ukazovatele?.trzby ?? null,
        zisk: ukazovatele?.vysledokHospodarenia ?? null,
        aktiva: ukazovatele?.aktivaCelkom ?? null,
        vlastneImanie: ukazovatele?.vlastneImanie ?? null,
        zadlzenost: ukazovatele?.zadlzenost ?? null,
        roa: ukazovatele?.roa ?? null,
      },
      pocetZavierok: zavierky.length,
      idNajnovsejZavierky: latestZavierka?.id ?? null,
    };

    // --- Build dph / tax ---
    const finsprData = finsprResult?.data;
    const dph = {
      registrovany: finsprData?.dph?.registrovany ?? false,
      icDph: finsprData?.dph?.icDph ?? null,
      paragraf: finsprData?.dph?.paragraf ?? null,
      vymazany: finsprData?.dph?.vymazany ?? false,
      dovodyZrusenia: finsprData?.dph?.dovodyZrusenia ?? null,
    };

    // --- Build insolvencia ---
    const replikData = replikResult?.data;
    const insolvencia = {
      found: replikData?.found ?? false,
      konania: (replikData?.konania ?? []).map((k) => ({
        konanieId: k.konanieId,
        spisovaZnacka: k.spisovaZnacka,
        sud: k.sud,
        druhKonania: k.druhKonania,
        stavKonania: k.stavKonania,
        datumZaciatku: k.datumZaciatku,
      })),
    };

    // --- Build kuv ---
    const rpvsData = rpvsResult?.data;
    const kuv = {
      found: rpvsData?.found ?? false,
      poznamka: rpvsData?.found ? undefined : "Firma nie je partnerom verejného sektora",
    };

    // --- Build eurofondy ---
    const itmsData = itmsResult?.data as { found: boolean; projekty: Array<unknown> } | undefined;
    const eurofondy = {
      found: itmsData?.found ?? false,
      projekty: itmsData?.projekty ?? [],
    };

    return {
      zakladneUdaje,
      statutari,
      spolocnici,
      sposobKonania: people?.sposobKonania ?? null,
      financie,
      dph,
      danovaSpolahlivost: { index: finsprData?.indexSpolahlivosti ?? null },
      danovyDlznik: finsprData?.danovyDlznik ?? false,
      insolvencia,
      kuv,
      eurofondy,
      vies: viesData,
      _meta: {
        zdrojeStatus,
        totalDurationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// --- Helpers ---

/** Unwrap a PromiseSettledResult, returning null on rejection. */
function unwrap<T>(settled: PromiseSettledResult<T>): T | null {
  if (settled.status === "fulfilled") return settled.value;
  return null;
}

/** Convert a settled promise + optional adapter result into a ZdrojStatusEntry. */
function settledToStatus(
  settled: PromiseSettledResult<unknown>,
  result: { found?: boolean; durationMs?: number; error?: string; source?: string } | null,
): ZdrojStatusEntry {
  if (settled.status === "rejected") {
    const isTimeout = settled.reason instanceof Error && settled.reason.message === "TIMEOUT";
    return {
      status: isTimeout ? "timeout" : "error",
      durationMs: 0,
      error: isTimeout ? "Overall timeout (15s)" : String(settled.reason),
    };
  }
  if (!result) return { status: "error", durationMs: 0, error: "No result" };
  if (result.error) return { status: "error", durationMs: result.durationMs ?? 0, error: result.error };
  if (!result.found) return { status: "not_found", durationMs: result.durationMs ?? 0 };
  return { status: "ok", durationMs: result.durationMs ?? 0 };
}
