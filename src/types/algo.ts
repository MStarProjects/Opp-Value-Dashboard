export interface AlgoTimePoint {
  dateKey: string;
  dateLabel: string;
  value?: number;
}

export interface AlgoSeriesRow {
  identifier: string;
  labelKey: string;
  label: string;
  latestValue?: number;
  points: AlgoTimePoint[];
}

export interface AlgoSignalSnapshot {
  identifier: string;
  labelKey: string;
  label: string;
  value?: number;
}

export interface AlgoDashboardData {
  available: boolean;
  mode: "country" | "sector";
  sourceFileName?: string;
  latestDateKey?: string;
  latestDateLabel?: string;
  trailingDateLabels: string[];
  rows: AlgoSeriesRow[];
  latestSignals: AlgoSignalSnapshot[];
  notes: string[];
}
