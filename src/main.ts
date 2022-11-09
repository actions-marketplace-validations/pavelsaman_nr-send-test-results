import fs from 'fs';
import axios from 'axios';
import moment from 'moment';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as artifact from '@actions/artifact';
import {config} from './config';
import {TestResult, TestResults, CommonProperties, TestResultsForNR} from './types';

const metricUrl = config.metricAPIUrl;
const desiredExitCode = core.getInput('fail-pipeline') === '1' ? 1 : 0;
const verboseLog = core.getInput('verbose-log') === '1' ? true : false;
const jobId = core.getInput('job-id') || github.context.job;

const timestamp = (): number => Math.round(Date.now() / 1000);
const getFormattedTime = (): string => moment(new Date()).format('YYYY-MM-DD-HH-mm-ss');

function printExitMessage(message: string): void {
  core.warning(
    `${github.context.action}: ${message}
    Exiting with exit code of ${desiredExitCode} as per "fail-pipeline" input variable.`,
  );
}

function getCommonAttributes(testResult: TestResult): CommonProperties {
  return {
    title: testResult.title,
    fullTitle: testResult.fullTitle,
    file: testResult.file,
    testSuite: testResult.fullTitle?.replace(testResult.title, '').trim(),
  };
}

function readResults(fileName: string): TestResults | undefined {
  try {
    const rawTestResults = fs.readFileSync(fileName);
    if (verboseLog) {
      console.log(rawTestResults.toString());
    }
    return JSON.parse(rawTestResults.toString());
  } catch (err) {
    return undefined;
  }
}

function testResultsAreParsable(data: TestResults): boolean {
  if (!data.passes || !data.failures) {
    return false;
  }

  return true;
}

function printFailures(failures: TestResult[]): void {
  let failuresAsString = '';
  for (const failure of failures) {
    failuresAsString += `${failure.file}\n${failure.fullTitle}\n${failure.err?.message}\n${failure.err?.stack}\n---\n`;
  }
  core.warning(failuresAsString);
}

function assembleResults(data: TestResults): TestResultsForNR[] {
  const passedTests = data.passes;
  // "failures" can contain failed tests as well as e.g. failed hooks
  // passes + failures != tests
  const failures = data.failures;
  printFailures(failures);

  const durations = [...passedTests, ...failures].map(test => {
    return {
      name: `test.case.duration`,
      type: 'gauge',
      value: test.duration,
      timestamp: timestamp(),
      attributes: {
        ...getCommonAttributes(test),
      },
    };
  });

  const testResults = [...passedTests, ...failures].map(test => {
    const testReturnValue = Object.keys(test.err).length === 0 ? 0 : 1;

    return {
      name: 'test.case.exit.code',
      type: 'gauge',
      value: testReturnValue,
      timestamp: timestamp(),
      attributes: {
        ...getCommonAttributes(test),
      },
    };
  });

  const resultForNR = [...durations, ...testResults];

  // I can get 413 Payload Too Large response code in New Relic
  const metricBuckets = [];
  while (resultForNR.length > 0) {
    metricBuckets.push([
      {
        metrics: resultForNR.splice(0, config.maxMetricsPerRequest),
      },
    ]);
  }

  return metricBuckets;
}

async function sendResults(resultsForNR: TestResultsForNR[]): Promise<void> {
  if (verboseLog) {
    console.log(`Sending ${resultsForNR.length} requests to New Relic.`);
    console.log(JSON.stringify(resultsForNR));
  }

  for (const metricBucket of resultsForNR) {
    if (verboseLog) {
      console.log(JSON.stringify(metricBucket));
    }

    try {
      const response = await axios({
        url: metricUrl,
        method: 'POST',
        headers: {
          'Api-Key': core.getInput('new-relic-license-key'),
        },
        data: JSON.stringify(metricBucket),
        timeout: config.axiosTimeoutSec,
      });
      core.info(`${response.status}\n${JSON.stringify(response.data)}`);
    } catch (err) {
      printExitMessage(`request to NR failed:\n${err.stack}`);
    }
  }
}

async function uploadTestResultsArtifact(fileName: string): Promise<void> {
  const artifactClient = artifact.create();
  const artifactName = `test_results_${jobId}_${getFormattedTime()}`;
  const files = [fileName];
  const rootDirectory = '.';
  const options = {
    continueOnError: false,
  };

  await artifactClient.uploadArtifact(artifactName, files, rootDirectory, options);
}

async function run(): Promise<void> {
  const fileName = core.getInput('test-result-filename');
  const testResults = readResults(fileName);

  if (!testResults) {
    printExitMessage(`${fileName} not found.`);
    process.exit(desiredExitCode);
  }

  if (core.getInput('upload-test-artifact') === '1') {
    await uploadTestResultsArtifact(fileName);
  }

  if (!testResultsAreParsable(testResults)) {
    printExitMessage(`Test data are not in the correct format.`);
    process.exit(desiredExitCode);
  }

  const metricsForNR = assembleResults(testResults);
  await sendResults(metricsForNR);
}

run();
