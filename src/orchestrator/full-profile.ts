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
import type { CompanyFinancialsResult } from "../types/ruz.types.js";
import type { CompanyTaxStatusResult } from "../types/finspr.types.js";
import type { CompanyKuvResult } from "../types/rpvs.types.js";
import type { CompanyInsolvencyResult } from "../types/replik.types.js";
import type { CompanyEuFundsResult } from "../types/itms.types.js";
import type { AdapterResult } from "../types/common.types.js";

const OVERALL_TIMEOUT_MS = 15_000;

export type ZdrojStatusEntry = {
  status: "ok" | "error" | "not_found" | "timeout";
  durationMs: number;
  error?: string;
};

/** Return type of RuzPipeline.getFinancials() */
type RuzPipelineResult = {
  success: boolean;
  data?: CompanyFinancialsResult;
  error?: string;
  durationMs: number;
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
    const { promise: timeoutPromise, clear: clearMainTimeout } = createTimeout(OVERALL_TIMEOUT_MS);

    const [rpoSettled, ruzSettled, rpvsSettled, finsprSettled, replikSettled, itmsSettled] =
      await Promise.allSettled([
        Promise.race([this.rpo.getEntityByIco(ico), timeoutPromise]),
        Promise.race([this.ruzPipeline.getFinancials(ico), timeoutPromise]),
        Promise.race([this.rpvs.getKuv(ico), timeoutPromise]),
        Promise.race([this.finspr.getTaxStatus(ico), timeoutPromise]),
        Promise.race([this.replik.getKonania(ico), timeoutPromise]),
        Promise.race([this.itms.findPrijimatel(ico), timeoutPromise]),
      ]);

    clearMainTimeout();

    // Extract results with proper types
    const rpoResult = unwrap<AdapterResult<RpoEntityDetail>>(rpoSettled);
    const ruzResult = unwrap<RuzPipelineResult>(ruzSettled);
    const rpvsResult = unwrap<AdapterResult<CompanyKuvResult>>(rpvsSettled);
    const finsprResult = unwrap<AdapterResult<CompanyTaxStatusResult>>(finsprSettled);
    const replikResult = unwrap<AdapterResult<CompanyInsolvencyResult>>(replikSettled);
    const itmsResult = unwrap<AdapterResult<CompanyEuFundsResult>>(itmsSettled);

    // Build zdrojeStatus consistently for all sources
    zdrojeStatus.rpo = adapterToStatus(rpoSettled, rpoResult);
    zdrojeStatus.ruz = ruzResult
      ? adapterToStatus(ruzSettled, { found: ruzResult.success, durationMs: ruzResult.durationMs, error: ruzResult.error })
      : settledToStatus(ruzSettled);
    zdrojeStatus.rpvs = adapterToStatus(rpvsSettled, rpvsResult);

    // FinSpr: expose granular sub-source keys per TOOLS-SPEC
    if (finsprResult?.data?.zdrojeStatus) {
      const fs = finsprResult.data.zdrojeStatus;
      zdrojeStatus.finspr_dlznici = fs.danovi_dlznici ?? { status: "error", durationMs: 0 };
      zdrojeStatus.finspr_dph = fs.dph_registracia ?? { status: "error", durationMs: 0 };
      zdrojeStatus.finspr_index = fs.index_spolahlivosti ?? { status: "error", durationMs: 0 };
    } else {
      const fallback = adapterToStatus(finsprSettled, finsprResult);
      zdrojeStatus.finspr_dlznici = fallback;
      zdrojeStatus.finspr_dph = fallback;
      zdrojeStatus.finspr_index = fallback;
    }

    zdrojeStatus.replik = adapterToStatus(replikSettled, replikResult);
    zdrojeStatus.itms = adapterToStatus(itmsSettled, itmsResult);

    const entity = rpoResult?.data;
    const people = entity ? this.rpo.mapPeople(entity) : null;

    // Phase 2: VIES — needs DIČ from FinSpr or RUZ
    const dic = finsprResult?.data?.dph?.icDph
      ?? ruzResult?.data?.uctovnaJednotka?.dic
      ?? null;

    let viesData: { valid: boolean | null; nazov: string | null; adresa: string | null } | null = null;
    const elapsed = Date.now() - start;
    if (dic && elapsed < OVERALL_TIMEOUT_MS - 2000) {
      const vatNumber = dic.startsWith("SK") ? dic : `SK${dic}`;
      const remaining = OVERALL_TIMEOUT_MS - elapsed;
      const { promise: viesTimeout, clear: clearViesTimeout } = createTimeout(remaining);
      try {
        const viesResult = await Promise.race([this.vies.checkVat(vatNumber), viesTimeout]);
        clearViesTimeout();
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
        clearViesTimeout();
        const isTimeout = err instanceof Error && err.message === "TIMEOUT";
        zdrojeStatus.vies = {
          status: isTimeout ? "timeout" : "error",
          durationMs: Date.now() - start - elapsed,
          error: isTimeout ? "Overall timeout" : String(err),
        };
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
            mesto: typeof currentAddr.municipality === "object"
              ? (currentAddr.municipality as { value: string })?.value ?? null
              : null,
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
        ?? ruzResult?.data?.uctovnaJednotka?.skNace
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
    const itmsData = itmsResult?.data;
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

/** Create a timeout promise that can be cleaned up. */
function createTimeout(ms: number): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

/** Unwrap a PromiseSettledResult, returning null on rejection. */
function unwrap<T>(settled: PromiseSettledResult<T>): T | null {
  if (settled.status === "fulfilled") return settled.value;
  return null;
}

/** Convert a settled promise into a ZdrojStatusEntry when no result is available. */
function settledToStatus(settled: PromiseSettledResult<unknown>): ZdrojStatusEntry {
  if (settled.status === "rejected") {
    const isTimeout = settled.reason instanceof Error && settled.reason.message === "TIMEOUT";
    return {
      status: isTimeout ? "timeout" : "error",
      durationMs: 0,
      error: isTimeout ? "Overall timeout (15s)" : String(settled.reason),
    };
  }
  return { status: "error", durationMs: 0, error: "No result" };
}

/** Convert an AdapterResult (or adapter-like result) into a ZdrojStatusEntry. */
function adapterToStatus(
  settled: PromiseSettledResult<unknown>,
  result: { found?: boolean; durationMs?: number; error?: string } | null,
): ZdrojStatusEntry {
  if (!result) return settledToStatus(settled);
  if (result.error) return { status: "error", durationMs: result.durationMs ?? 0, error: result.error };
  if (!result.found) return { status: "not_found", durationMs: result.durationMs ?? 0 };
  return { status: "ok", durationMs: result.durationMs ?? 0 };
}
