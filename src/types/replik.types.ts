/**
 * Types for IS REPLIK (insolvenčné konania).
 * Source: replik-ws.justice.sk SOAP services
 */

// --- Raw SOAP response types ---

export type ReplikKonanieRaw = {
  konanieId?: string;
  spisovaZnacka?: string;
  sud?: string;
  druhKonania?: string;
  stavKonania?: string;
  spravcaMeno?: string;
  spravcaZnacka?: string;
  datumZaciatku?: string;
  datumUkoncenia?: string;
};

export type ReplikKonaniaResponse = {
  konania?: ReplikKonanieRaw[] | ReplikKonanieRaw;
};

export type ReplikKonanieDetailRaw = ReplikKonanieRaw & {
  udalosti?: ReplikUdalostRaw[] | ReplikUdalostRaw;
  dlznik?: {
    nazov?: string;
    ico?: string;
    sidlo?: string;
  };
  spravca?: {
    meno?: string;
    znacka?: string;
    adresa?: string;
  };
};

export type ReplikUdalostRaw = {
  datum?: string;
  typ?: string;
  popis?: string;
};

export type ReplikOznamRaw = {
  oznamId?: string;
  konanieId?: string;
  druhOznamu?: string;
  datumZverejnenia?: string;
  text?: string;
};

export type ReplikOznamyResponse = {
  oznamy?: ReplikOznamRaw[] | ReplikOznamRaw;
};

// --- Mapped output types ---

export type InsolvencyProceeding = {
  konanieId: string;
  spisovaZnacka: string | null;
  sud: string | null;
  druhKonania: string | null;
  stavKonania: string | null;
  spravca: {
    meno: string | null;
    znacka: string | null;
  } | null;
  datumZaciatku: string | null;
  datumUkoncenia: string | null;
};

export type CompanyInsolvencyResult = {
  ico: string;
  found: boolean;
  konania: InsolvencyProceeding[];
};

export type InsolvencyNotice = {
  oznamId: string;
  konanieId: string | null;
  druhOznamu: string | null;
  datumZverejnenia: string | null;
  text: string | null;
};

export type CompanyInsolvencyNoticesResult = {
  ico: string;
  found: boolean;
  oznamy: InsolvencyNotice[];
};

export type InsolvencyEvent = {
  datum: string | null;
  typ: string | null;
  popis: string | null;
};

export type InsolvencyDetailResult = {
  konanieId: string;
  spisovaZnacka: string | null;
  sud: string | null;
  druhKonania: string | null;
  stavKonania: string | null;
  dlznik: {
    nazov: string | null;
    ico: string | null;
    sidlo: string | null;
  } | null;
  spravca: {
    meno: string | null;
    znacka: string | null;
    adresa: string | null;
  } | null;
  datumZaciatku: string | null;
  datumUkoncenia: string | null;
  udalosti: InsolvencyEvent[];
};
