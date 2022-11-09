import fs from 'fs';
import axios from 'axios';
import moment from 'moment';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as artifact from '@actions/artifact';
import {config} from './config';
import {TestResults, CommonGithubProperties, TestResultsForNR} from './types';

const metricUrl = config.metricAPIUrl;
const metricId = core.getInput('metric-id');
const desiredExitCode = core.getInput('fail-pipeline') === '1' ? 1 : 0;
const verboseLog = core.getInput('verbose-log') === '1' ? true : false;
const jobId = core.getInput('job-id') || github.context.job;

const timestamp = (): number => Math.round(Date.now() / 1000);
const getFormattedTime = (): string => moment(new Date()).format('YYYY-MM-DD-HH-mm-ss');
const isPullRequest = (githubBranch: string): boolean => githubBranch.includes('refs/pull/');

function printExitMessage(message: string): void {
  core.warning(
    `${github.context.action}: ${message}
    Exiting with exit code of ${desiredExitCode} as per "fail-pipeline" input variable.`,
  );
}

function getCommonGithubProperties(): CommonGithubProperties {
  if (verboseLog) {
    console.log(github.context);
  }

  let githubBranch = github.context.ref.replace(/^refs\/heads\//, '');
  if (isPullRequest(githubBranch)) {
    githubBranch = github.context.payload?.pull_request?.head?.ref;
  }
  return {
    metricId,
    'github.branch': githubBranch,
    'github.ref': github.context.ref,
    'github.workflow': github.context.workflow,
    'github.project': github.context.repo.repo,
    'github.job': jobId,
    'github.eventName': github.context.eventName,
    'github.actor': github.context.actor,
    'github.runId': github.context.runId,
    'github.runner.arch': process.env.RUNNER_ARCH,
    'github.runner.os': process.env.RUNNER_OS,
    'github.runner.name': process.env.RUNNER_NAME,
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

function assembleResults(data: TestResults): TestResultsForNR[] {
  const passedTests = data.passes;
  // "failures" can contain failed tests as well as e.g. failed hooks
  // passes + failures != tests
  const failures = data.failures;

  const testResults = [...passedTests, ...failures].map(test => {
    const testCaseExitCode = Object.keys(test.err).length === 0 ? 0 : 1;

    let stackTrace = {};
    if (test.err?.stack) {
      stackTrace = {
        stackTrace: test.err.stack,
      };
    }

    let errorMessage = {};
    if (test.err?.message) {
      errorMessage = {
        errorMessage: test.err.message,
      };
    }

    return {
      attributes: {
        title: test.title,
        fullTitle: test.fullTitle,
        file: test.file,
        testSuite: test.fullTitle?.replace(test.title, '').trim(),
        'exit.code': testCaseExitCode,
        duration: test.duration,
        ...stackTrace,
        ...errorMessage,
      },
    };
  });

  // I can get 413 Payload Too Large response code in New Relic
  const metricBuckets = [];
  while (testResults.length > 0) {
    metricBuckets.push([
      {
        logs: testResults.splice(0, config.maxMetricsPerRequest),
        common: {
          timestamp: timestamp(),
          attributes: getCommonGithubProperties(),
        },
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
