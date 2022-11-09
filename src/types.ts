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
  failed: boolean;
  stackTrace?: string;
  errorMessage?: string;
};

export type TestResults = {
  tests: TestResult[];
};

export type CommonGithubProperties = {
  'git.branch': string;
  'git.ref': string;
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
    logtype: string;
    timestamp: number;
    attributes: CommonGithubProperties;
  };
}[];
