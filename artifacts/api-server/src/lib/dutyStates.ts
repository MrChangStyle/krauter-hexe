/**
 * Pflichten je Bundesland (docs/pflichten.md): the Tierseuchenkasse of each
 * Land, its website, the stock day and the deadline of the yearly stock
 * report. Where a deadline could not be checked it stays null and the app
 * says "laut Meldebogen" with the usual mid-January date. Researched October
 * 2026 from the Kassen's own pages where possible – guide values (Richtwerte),
 * listed under „Offen“ for review; the Kasse's letter always wins.
 */

export const STATE_CODES = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
export type StateCode = (typeof STATE_CODES)[number];

export interface StateRules {
  name: string;
  /** The Land's Tierseuchenkasse (or the office that runs it). */
  tsk: string;
  url: string | null;
  /** Day of January the animals are counted on. */
  stockDay: number;
  /** Day of January the report is due; null when not checked. */
  dueDay: number | null;
  /** Anything that differs from the usual report, shown with it. */
  note: string | null;
}

export const STATES: Record<StateCode, StateRules> = {
  BW: { name: 'Baden-Württemberg', tsk: 'Tierseuchenkasse Baden-Württemberg', url: 'https://www.tsk-bw.de', stockDay: 1, dueDay: 15, note: null },
  BY: { name: 'Bayern', tsk: 'Bayerische Tierseuchenkasse', url: 'https://www.btsk.de', stockDay: 1, dueDay: 20, note: 'Melden geht per Post, im Tierhalter-Login oder per QR-Code auf dem Meldebogen.' },
  BE: { name: 'Berlin', tsk: 'Tierseuchenkasse Berlin (beim LAGeSo)', url: 'https://www.berlin.de/lageso/', stockDay: 1, dueDay: null, note: null },
  BB: { name: 'Brandenburg', tsk: 'Tierseuchenkasse Brandenburg', url: 'https://www.tsk-bb.de', stockDay: 1, dueDay: null, note: null },
  HB: { name: 'Bremen', tsk: 'Tierseuchenkasse Bremen (beim LMTVet)', url: 'https://www.lmtvet.bremen.de', stockDay: 1, dueDay: null, note: null },
  HH: { name: 'Hamburg', tsk: 'Tierseuchenkasse Hamburg', url: null, stockDay: 1, dueDay: null, note: null },
  HE: { name: 'Hessen', tsk: 'Hessische Tierseuchenkasse', url: 'https://hessischetierseuchenkasse.de', stockDay: 1, dueDay: null, note: null },
  MV: {
    name: 'Mecklenburg-Vorpommern',
    tsk: 'Tierseuchenkasse Mecklenburg-Vorpommern',
    url: 'https://www.tskmv.de',
    stockDay: 3,
    dueDay: null,
    note: 'Kasse und Veterinäramt tauschen keine Daten aus – Beginn, große Änderungen und Ende der Haltung beiden melden.',
  },
  NI: { name: 'Niedersachsen', tsk: 'Niedersächsische Tierseuchenkasse', url: 'https://www.ndstsk.de', stockDay: 3, dueDay: 17, note: null },
  NW: {
    name: 'Nordrhein-Westfalen',
    tsk: 'Tierseuchenkasse NRW (Landwirtschaftskammer)',
    url: 'https://www.landwirtschaftskammer.de/landwirtschaft/tierseuchenkasse/',
    stockDay: 1,
    dueDay: 31,
    note: 'Für Schweine, Schafe, Ziegen, Geflügel und Bienen zählt in NRW der Jahreshöchstbestand, für Pferde der 1. Januar. Rinder kommen aus HI-Tier.',
  },
  RP: { name: 'Rheinland-Pfalz', tsk: 'Tierseuchenkasse Rheinland-Pfalz', url: 'https://www.tierseuchenkasse-rlp.de', stockDay: 1, dueDay: null, note: null },
  SL: { name: 'Saarland', tsk: 'Tierseuchenkasse Saarland', url: 'https://www.tsk-sl.de', stockDay: 1, dueDay: null, note: null },
  SN: { name: 'Sachsen', tsk: 'Sächsische Tierseuchenkasse', url: 'https://www.tsk-sachsen.de', stockDay: 1, dueDay: 15, note: 'Wer neu anfängt, meldet sich innerhalb von 30 Tagen.' },
  ST: { name: 'Sachsen-Anhalt', tsk: 'Tierseuchenkasse Sachsen-Anhalt', url: 'https://www.tskst.de', stockDay: 1, dueDay: null, note: 'Wer neu anfängt, meldet sich innerhalb von zwei Wochen.' },
  SH: { name: 'Schleswig-Holstein', tsk: 'Tierseuchenfonds Schleswig-Holstein', url: null, stockDay: 1, dueDay: null, note: null },
  TH: { name: 'Thüringen', tsk: 'Thüringer Tierseuchenkasse', url: 'https://www.thtsk.de', stockDay: 3, dueDay: 17, note: 'Neue Tiere nach dem Stichtag gleich nachmelden.' },
};

/** Without a known deadline (or a Land), mid-January as before. */
export const DEFAULT_DUE_DAY = 15;

export function isStateCode(code: unknown): code is StateCode {
  return typeof code === 'string' && (STATE_CODES as readonly string[]).includes(code);
}

/** The pushes for a report: about two weeks and three days before it is due. */
export function reportPushDays(dueDay: number): number[] {
  return [dueDay - 13, dueDay - 3];
}
