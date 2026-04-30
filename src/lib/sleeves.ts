import type { SourceRole } from "@/lib/data-sources";
import {
  pmhubWorkbookContracts,
  type PmhubWorkbookContract,
} from "@/lib/pmhub-workbook-contract";

export type SleeveId = "global_xus" | "us_opp" | "consumer" | "dividend";

export interface AlgoSleeveContract {
  sheetName: string;
  mode: "country" | "sector";
  rowStartIndex: number;
  rowEndIndex: number;
}

export interface SleeveConfig {
  id: SleeveId;
  tabLabel: string;
  title: string;
  eyebrow: string;
  portfolioSourceRole: SourceRole;
  pmhubContract: PmhubWorkbookContract;
  algoContract: AlgoSleeveContract;
  secondaryExposureTitle: string;
  secondaryExposureType: "country" | "industry";
  detailVariant: "global_xus" | "us_opp";
}

export const sleeveConfigs: Record<SleeveId, SleeveConfig> = {
  global_xus: {
    id: "global_xus",
    tabLabel: "Global xUS Opp Value",
    title: "Global xUS Opportunistic Value",
    eyebrow: "Equity Sleeve Dashboard",
    portfolioSourceRole: "pmhub_global_xus",
    pmhubContract: pmhubWorkbookContracts.global_xus,
    algoContract: {
      sheetName: "International_Opp_Value",
      mode: "country",
      rowStartIndex: 0,
      rowEndIndex: 28,
    },
    secondaryExposureTitle: "Country Position",
    secondaryExposureType: "country",
    detailVariant: "global_xus",
  },
  us_opp: {
    id: "us_opp",
    tabLabel: "US Opp Value",
    title: "US Opportunistic Value",
    eyebrow: "Equity Sleeve Dashboard",
    portfolioSourceRole: "pmhub_us_opp",
    pmhubContract: pmhubWorkbookContracts.us_opp,
    algoContract: {
      sheetName: "US_Opp_Value",
      mode: "sector",
      rowStartIndex: 0,
      rowEndIndex: 10,
    },
    secondaryExposureTitle: "Industry Position",
    secondaryExposureType: "industry",
    detailVariant: "us_opp",
  },
  consumer: {
    id: "consumer",
    tabLabel: "Consumer",
    title: "Consumer",
    eyebrow: "Equity Sleeve Dashboard",
    portfolioSourceRole: "pmhub_consumer",
    pmhubContract: pmhubWorkbookContracts.consumer,
    algoContract: {
      sheetName: "International_Opp_Value",
      mode: "country",
      rowStartIndex: 0,
      rowEndIndex: 28,
    },
    secondaryExposureTitle: "Country Position",
    secondaryExposureType: "country",
    detailVariant: "global_xus",
  },
  dividend: {
    id: "dividend",
    tabLabel: "Dividend",
    title: "Dividend",
    eyebrow: "Equity Sleeve Dashboard",
    portfolioSourceRole: "pmhub_dividend",
    pmhubContract: pmhubWorkbookContracts.dividend,
    algoContract: {
      sheetName: "International_Opp_Value",
      mode: "country",
      rowStartIndex: 0,
      rowEndIndex: 28,
    },
    secondaryExposureTitle: "Country Position",
    secondaryExposureType: "country",
    detailVariant: "global_xus",
  },
};

export const sleeveOrder: SleeveId[] = [
  "global_xus",
  "us_opp",
  "consumer",
  "dividend",
];

export function getSleeveConfig(sleeveId: SleeveId) {
  return sleeveConfigs[sleeveId];
}

export function isSleeveId(value: string | null | undefined): value is SleeveId {
  return Boolean(value && value in sleeveConfigs);
}
