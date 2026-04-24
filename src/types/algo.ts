export interface AlgoTimePoint {
  dateKey: string;
  dateLabel: string;
  value?: number;
}

export interface AlgoCountrySeries {
  identifier: string;
  countryCode: string;
  country: string;
  latestValue?: number;
  points: AlgoTimePoint[];
}

export interface AlgoCountrySnapshot {
  identifier: string;
  countryCode: string;
  country: string;
  value?: number;
}

export interface AlgoDashboardData {
  available: boolean;
  sourceFileName?: string;
  latestDateKey?: string;
  latestDateLabel?: string;
  trailingDateLabels: string[];
  rows: AlgoCountrySeries[];
  latestCountrySignals: AlgoCountrySnapshot[];
  notes: string[];
}
