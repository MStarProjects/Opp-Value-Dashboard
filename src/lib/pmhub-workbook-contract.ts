export interface PmhubWorkbookContract {
  sheetName: string;
  headerRowIndex: number;
  dataStartRowIndex: number;
  weightColumnIndex: number;
  benchmarkInvestmentId: string;
  directDataSetIdOrName: string;
}

export const pmhubFieldAliases = {
  securityName: ["security name"],
  isin: ["isin"],
  cusip: ["cusip"],
  sedol: ["sedol"],
  ticker: ["ticker"],
  country: ["country code", "country"],
  currencyContribution: ["currency contrib"],
  currency: ["currency"],
  price: ["last/price"],
  weight: ["weight"],
  mtdReturn: ["%chg - mtd"],
  roe: ["roe"],
  forwardPE: ["pe fy1"],
  priceToBook: ["price/bk"],
  oneMonthReturn: ["%chg - 1 mo"],
  ytdReturn: ["%chg - ytd"],
  oneYearReturn: ["%chg - 12 mo"],
  contributionToReturnMtd: ["contribution to return - mtd"],
  contributionToReturnYtd: ["contribution to return - ytd"],
  contributionToReturnOneMonth: ["contribution to return - 1 mo"],
  sector: ["sector", "gics sector", "morningstar sector"],
  industry: ["industry", "gics industry", "morningstar industry"],
  priceToFairValue: ["price to fair value", "p/fv", "mer p/fair value"],
  moat: ["economic moat", "moat"],
  uncertainty: ["fair value uncertainty", "uncertainty"],
  benchmarkWeight: ["benchmark weight", "weight in benchmark"],
  businessCountry: ["business country"],
} as const;

export type PmhubFieldKey = keyof typeof pmhubFieldAliases;

export const pmhubWorkbookContracts = {
  global_xus: {
    sheetName: "Sheet A",
    headerRowIndex: 0,
    dataStartRowIndex: 2,
    weightColumnIndex: 6,
    benchmarkInvestmentId: "MGXTMENU",
    directDataSetIdOrName: "Global xUS Opp Value",
  },
  us_opp: {
    sheetName: "Sheet A",
    headerRowIndex: 0,
    dataStartRowIndex: 2,
    weightColumnIndex: 4,
    benchmarkInvestmentId: "F000011IK3",
    directDataSetIdOrName: "US Opp Value",
  },
  consumer: {
    sheetName: "Sheet A",
    headerRowIndex: 0,
    dataStartRowIndex: 2,
    weightColumnIndex: 4,
    benchmarkInvestmentId: "",
    directDataSetIdOrName: "Consumer",
  },
  dividend: {
    sheetName: "Sheet A",
    headerRowIndex: 0,
    dataStartRowIndex: 2,
    weightColumnIndex: 4,
    benchmarkInvestmentId: "",
    directDataSetIdOrName: "Dividend",
  },
} as const satisfies Record<string, PmhubWorkbookContract>;
