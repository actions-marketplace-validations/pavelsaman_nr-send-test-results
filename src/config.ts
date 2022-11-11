export const config = {
  apiUrl: 'https://log-api.eu.newrelic.com/log/v1',
  axiosTimeoutSec: 10_000,
  maxTestCasesPerRequest: 70,
  filePathToProject: `${process.env.GITHUB_WORKSPACE}/` ?? '',
  urlToFileAtCommit: `${process.env?.GITHUB_SERVER_URL}/${process.env?.GITHUB_REPOSITORY}/blob/{commit}/{filePath}`,
};
