type ErrorAttributes = {
  stack?: string;
  message?: string;
};

export type TestResult = {
  file: string;
  title: string;
  fullTitle: string;
  duration: number;
  err: ErrorAttributes;
};

export type TestResults = {
  passes: TestResult[];
  failures: TestResult[];
};

export type CommonProperties = {
  [index: string]: string | number | undefined;
};

export type TestResultForNR = {
  name: string;
  type: string;
  value: number;
  timestamp: number;
  attributes: CommonProperties;
};

export type TestResultsForNR = {
  metrics: TestResultForNR[];
}[];
