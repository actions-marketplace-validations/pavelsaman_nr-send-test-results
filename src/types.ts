type ErrorAttributes = {
  stack?: string;
  message?: string;
};

type TestResult = {
  file: string;
  title: string;
  fullTitle: string;
  duration: number;
  err: ErrorAttributes;
};

type TestResultForNR = {
  attributes: TestResultAttributesForNR;
};

type TestResultAttributesForNR = {
  file: string;
  title: string;
  fullTitle: string;
  testSuite: string;
  duration: number;
  'exit.code': number;
  stackTrace?: string;
  errorMessage?: string;
};

export type TestResults = {
  passes: TestResult[];
  failures: TestResult[];
};

export type CommonGithubProperties = {
  metricId: string;
  'github.branch': string;
  'github.ref': string;
  'github.workflow': string;
  'github.project': string;
  'github.job': string;
  'github.eventName': string;
  'github.actor': string;
  'github.runId': number;
  'github.runner.arch': string | undefined;
  'github.runner.os': string | undefined;
  'github.runner.name': string | undefined;
};

export type TestResultsForNR = {
  logs: TestResultForNR[];
  common: {
    timestamp: number;
    attributes: CommonGithubProperties;
  };
}[];
