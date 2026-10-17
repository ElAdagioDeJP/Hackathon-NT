import { searchNotices, type SearchNoticesOptions } from "../TED/fetch";
import type { TedField, TedNotice, TedSearchRequest } from "../TED/types";
import type { BusinessModel, ContractModel } from "./types";

const MATCH_FIELDS: TedField[] = [
  "classification-cpv",
  "contract-title",
  "title-lot",
  "notice-title",
  "description-proc",
  "description-lot",
  "contract-nature",
  "deadline-receipt-tender-date-lot",
  "place-of-performance-country-proc",
  "place-of-performance-country-lot",
  "place-of-performance-city-proc",
  "place-of-performance-city-lot",
  "notice-type",
  "buyer-name",
  "organisation-name-buyer",
];

const EXCLUDED_NOTICE_TYPES =
  "veat can-standard can-social can-modif compl can-tran";

export const CANDIDATE_LIMIT = 20;

export function placeCountriesFor(business: BusinessModel): string[] {
  if (business.coverageScope === "international") {
    const codes = [
      ...new Set(
        business.coverageCountries
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    if (!codes.length) {
      throw new Error(
        "International coverage needs at least one country before Finding matches.",
      );
    }
    return codes;
  }
  const home = business.country.trim().toUpperCase();
  if (!home) throw new Error("A business country is required for Matching.");
  return [home];
}

export function buildTedSearchRequest(business: BusinessModel): TedSearchRequest {
  const places = placeCountriesFor(business);
  const placeList = places.join(" ");
  return {
    query: `place-of-performance IN (${placeList}) AND notice-type NOT IN (${EXCLUDED_NOTICE_TYPES}) SORT BY ojs-number DESC`,
    fields: MATCH_FIELDS,
    limit: CANDIDATE_LIMIT,
    page: 1,
    scope: "ACTIVE",
  };
}

export async function fetchCandidateContracts(
  business: BusinessModel,
  options?: SearchNoticesOptions,
): Promise<ContractModel[]> {
  const response = await searchNotices(buildTedSearchRequest(business), options);
  return response.notices.map(noticeToContractModel);
}

export function noticeToContractModel(notice: TedNotice): ContractModel {
  const id = notice["publication-number"]?.trim();
  if (!id) throw new Error("TED notice is missing a publication number.");

  const title =
    pickLocalized(notice["contract-title"]) ||
    pickLocalized(notice["notice-title"]) ||
    pickLocalizedList(notice["title-lot"]) ||
    id;

  const description =
    pickLocalized(notice["description-proc"]) ||
    pickLocalizedList(notice["description-lot"]) ||
    "";

  const placeCountries = uniqueStrings([
    ...(notice["place-of-performance-country-proc"] ?? []),
    ...(notice["place-of-performance-country-lot"] ?? []),
  ]);

  const deadline =
    notice["deadline-receipt-tender-date-lot"]?.find((value) => value?.trim()) ??
    null;

  const buyerName =
    pickLocalizedList(notice["buyer-name"]) ||
    pickLocalizedList(notice["organisation-name-buyer"]) ||
    null;

  return {
    id,
    title,
    url: pickNoticeUrl(notice) || `https://ted.europa.eu/en/notice/-/detail/${id}`,
    description,
    placeCountries,
    cpvCodes: uniqueStrings(notice["classification-cpv"] ?? []),
    deadline,
    buyerName,
  };
}

function pickNoticeUrl(notice: TedNotice): string | null {
  const links = notice.links;
  return (
    pickLink(links.htmlDirect) ||
    pickLink(links.html) ||
    pickLink(links.pdf) ||
    pickLink(links.pdfs) ||
    null
  );
}

function pickLink(map?: Record<string, string>): string | null {
  if (!map) return null;
  return (
    map.ENG ||
    map.eng ||
    map.EN ||
    map.en ||
    Object.values(map).find((value) => value?.trim()) ||
    null
  );
}

function pickLocalized(map?: Record<string, string>): string {
  if (!map) return "";
  return (
    map.eng ||
    map.ENG ||
    map.en ||
    map.EN ||
    Object.values(map).find((value) => value?.trim()) ||
    ""
  ).trim();
}

function pickLocalizedList(map?: Record<string, string[]>): string {
  if (!map) return "";
  const preferred =
    map.eng || map.ENG || map.en || map.EN || Object.values(map).find(Boolean);
  if (!preferred?.length) return "";
  return preferred.map((part) => part.trim()).filter(Boolean).join(" · ");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
