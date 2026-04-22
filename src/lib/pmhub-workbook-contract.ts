export const pmhubWorkbookContract = {
  sheetName: "Sheet A",
  headerRowIndex: 0,
  dataStartRowIndex: 2,
  weightColumnIndex: 6,
  benchmarkInvestmentId: "MGXTMENU",
  directDataSetIdOrName: "Global xUS Opp Value",
} as const;

export const pmhubFieldAliases = {
  securityName: ["security name"],
  isin: ["isin"],
  cusip: ["cusip"],
  sedol: ["sedol"],
  ticker: ["ticker"],
  country: ["country code"],
  currencyContribution: ["currency contrib"],
  currency: ["currency"],
  price: ["last/price"],
  weight: ["weight"],
  roe: ["roe"],
  forwardPE: ["pe fy1"],
  priceToBook: ["price/bk"],
  oneMonthReturn: ["%chg - 1 mo"],
  ytdReturn: ["%chg - ytd"],
  sector: ["sector", "gics sector", "morningstar sector"],
  priceToFairValue: ["price to fair value", "p/fv", "mer p/fair value"],
  moat: ["economic moat", "moat"],
  uncertainty: ["fair value uncertainty", "uncertainty"],
  benchmarkWeight: ["benchmark weight", "weight in benchmark"],
  businessCountry: ["business country"],
} as const;

export type PmhubFieldKey = keyof typeof pmhubFieldAliases;
