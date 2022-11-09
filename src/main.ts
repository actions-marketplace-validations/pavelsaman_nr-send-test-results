import fs from 'fs';
import axios from 'axios';
import moment from 'moment';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as artifact from '@actions/artifact';
import {config} from './config';
import {TestResult, TestResults, GitHubProperties, TestResultsForNR} from './types';

const desiredExitCode = core.getInput('fail-pipeline') === '1' ? 1 : 0;
const jobId = core.getInput('job-id') || github.context.job;

const timestamp = (): number => Math.round(Date.now());
const getFormattedTime = (): string => moment(new Date()).format('YYYY-MM-DD-HH-mm-ss');
const isPullRequest = (githubBranch: string): boolean => githubBranch.includes('refs/pull/');
const testCaseFailed = (testCase: TestResult): boolean => (Object.keys(testCase.err).length === 0 ? false : true);

function printExitMessage(message: string): void {
  core.warning(
    `${github.context.action}: ${message}
    Exiting with exit code of ${desiredExitCode} as per "fail-pipeline" input variable.`,
  );
}

function printFailures(failures: TestResult[]): void {
  let failuresAsString = 'Failed test cases:\n\n';
  for (const failure of failures) {
    failuresAsString += `${failure.file}\n${failure.fullTitle}\n${failure.err?.message}\n${failure.err?.stack}\n---\n`;
  }
  core.error(failuresAsString);
}

function getGithubProperties(): GitHubProperties {
  let githubBranch = github.context.ref.replace(/^refs\/heads\//, '');
  if (isPullRequest(githubBranch)) {
    githubBranch = github.context.payload?.pull_request?.head?.ref;
  }

  return {
    'git.branch': githubBranch,
    'git.ref': github.context.ref,
    'git.sha': github.context.sha,
    'github.action': github.context.action,
    'github.workflow': github.context.workflow,
    'github.project': github.context.repo.repo,
    'github.job': jobId,
    'github.eventName': github.context.eventName,
    'github.actor': github.context.actor,
    'github.runId': github.context.runId,
    'github.runNumber': github.context.runNumber,
    'github.runner.arch': process.env.RUNNER_ARCH,
    'github.runner.os': process.env.RUNNER_OS,
    'github.runner.name': process.env.RUNNER_NAME,
  };
}

function readResults(fileName: string): TestResults | undefined {
  try {
    const rawTestResults = fs.readFileSync(fileName);
    return JSON.parse(rawTestResults.toString());
  } catch (err) {
    return undefined;
  }
}

function testResultsAreParsable(data: TestResults): boolean {
  if (!data.tests) {
    return false;
  }

  return true;
}

function assembleResults(data: TestResults): TestResultsForNR[] {
  printFailures(data.failures);

  const testResults = data.tests.map(test => {
    let errorMessage = {};
    if (test.err?.message) {
      errorMessage = {
        errorMessage: test.err.message,
      };
    }

    let stackTrace = {};
    if (test.err?.stack) {
      stackTrace = {
        errorStack: test.err.stack,
      };
    }

    return {
      message: `nr-send-test-result: test case ${testCaseFailed(test) ? 'FAILED' : 'PASSED'}`,
      attributes: {
        testFile: test.file,
        testSuite: test.fullTitle?.replace(test.title, '').trim(),
        testTitle: test.title,
        testFullTitle: test.fullTitle,
        testFailure: testCaseFailed(test),
        testDuration: test.duration,
        ...stackTrace,
        ...errorMessage,
      },
    };
  });

  // I can get 413 Payload Too Large response code in New Relic
  const buckets = [];
  while (testResults.length > 0) {
    buckets.push([
      {
        logs: testResults.splice(0, config.maxTestCasesPerRequest),
        common: {
          logType: 'test.case',
          timestamp: timestamp(),
          attributes: getGithubProperties(),
        },
      },
    ]);
  }

  return buckets;
}

async function sendResults(resultsForNR: TestResultsForNR[]): Promise<void> {
  for (const bucket of resultsForNR) {
    try {
      const response = await axios({
        url: config.apiUrl,
        method: 'POST',
        headers: {
          'Api-Key': core.getInput('new-relic-license-key'),
        },
        data: JSON.stringify(bucket),
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
  const verboseLog = core.getInput('verbose-log') === '1' ? true : false;
  core.setCommandEcho(verboseLog);

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

  const logsForNR = assembleResults(testResults);
  await sendResults(logsForNR);
}

run();
