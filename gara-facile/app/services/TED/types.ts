export type TedScope = "LATEST" | "ACTIVE" | "ALL";

export type TedContractNature =
  | "works"
  | "supplies"
  | "services"
  | (string & {});

export type TedNoticeType =
  | "cn-standard"
  | "pin-rtl"
  | "pin-buyer"
  | (string & {});

export type TedLocalizedText = Record<string, string>;

export type TedLocalizedTextList = Record<string, string[]>;

export type TedField =
  | "classification-cpv"
  | "contract-title"
  | "title-lot"
  | "notice-title"
  | "description-proc"
  | "description-lot"
  | "contract-nature"
  | "estimated-value-proc"
  | "estimated-value-lot"
  | "estimated-value-cur-proc"
  | "estimated-value-cur-lot"
  | "deadline-receipt-tender-date-lot"
  | "contract-duration-start-date-lot"
  | "contract-duration-end-date-lot"
  | "duration-period-value-lot"
  | "duration-period-unit-lot"
  | "renewal-description-lot"
  | "place-of-performance-country-proc"
  | "place-of-performance-country-lot"
  | "place-of-performance-city-proc"
  | "place-of-performance-city-lot"
  | "sme-lot"
  | "subcontracting-allowed-lot"
  | "award-criterion-description-lot"
  | "notice-type"
  | "buyer-name"
  | "organisation-name-buyer"
  | "document-url-lot"
  | "submission-url-lot"
  | "submission-nonelectronic-lot"
  | "submission-nonelectronic-description-lot"
  | "electronic-submission-lot"
  | "submission-language"
  | "touchpoint-email-tender-receip-lot"
  | "touchpoint-email-buyer"
  | "buyer-profile"
  | "touchpoint-internet-address-buyer"
  | (string & {});

export interface TedSearchRequest {
  // EXPERT QUERY. See https://ted.europa.eu/en/expert-search
  query: string;
  fields: TedField[];
  limit?: number;
  page?: number;
  scope?: TedScope;
  onlyLatestVersions?: boolean;
  paginationMode?: "PAGE_NUMBER" | "ITERATION";
  iterationNextToken?: string;
  checkQuerySyntax?: boolean;
}

export interface TedNoticeLinks {
  xml?: Record<string, string>;
  pdf?: Record<string, string>;
  pdfs?: Record<string, string>;
  html?: Record<string, string>;
  htmlDirect?: Record<string, string>;
}

export interface TedNotice {
  "publication-number": string;
  "notice-type": TedNoticeType;
  links: TedNoticeLinks;

  // CORE SCOPE & INDUSTRY MATCHING
  "classification-cpv"?: string[];
  "contract-title"?: TedLocalizedText;
  "title-lot"?: TedLocalizedTextList;
  "notice-title"?: TedLocalizedText;
  "description-proc"?: TedLocalizedText;
  "description-lot"?: TedLocalizedTextList;
  "contract-nature"?: TedContractNature[];

  // FINANCIAL AVAILABILITY
  "estimated-value-proc"?: string;
  "estimated-value-lot"?: string[];
  "estimated-value-cur-proc"?: string;
  "estimated-value-cur-lot"?: string[];

  // DEADLINES & TIMING
  "deadline-receipt-tender-date-lot"?: string[];
  "contract-duration-start-date-lot"?: string[];
  "contract-duration-end-date-lot"?: string[];
  "duration-period-value-lot"?: string[];
  "duration-period-unit-lot"?: string[];
  "renewal-description-lot"?: TedLocalizedTextList;

  // LOCATION & DELIVERY
  "place-of-performance-country-proc"?: string[];
  "place-of-performance-country-lot"?: string[];
  "place-of-performance-city-proc"?: string[];
  "place-of-performance-city-lot"?: string[];

  // ELIGIBILITY & BIDDING STRATEGY
  "sme-lot"?: boolean[];
  "subcontracting-allowed-lot"?: boolean[];
  "award-criterion-description-lot"?: TedLocalizedTextList;

  // SOURCING & METADATA
  "buyer-name"?: TedLocalizedTextList;
  "organisation-name-buyer"?: TedLocalizedTextList;
  "document-url-lot"?: string[];
  "submission-url-lot"?: string[];

  // SUBMISSIONS & CONTACT POINTS
  "submission-nonelectronic-lot"?: string[];
  "submission-nonelectronic-description-lot"?: TedLocalizedTextList;
  "electronic-submission-lot"?: boolean[];
  "submission-language"?: string[];
  "touchpoint-email-tender-receip-lot"?: string[];
  "touchpoint-email-buyer"?: string[];
  "buyer-profile"?: string[];
  "touchpoint-internet-address-buyer"?: string[];
}

export interface TedSearchResponse {
  notices: TedNotice[];
  totalNoticeCount: number;
  iterationNextToken: string | null;
  timedOut: boolean;
}
