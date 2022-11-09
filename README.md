# Send test data to New Relic

## Description

Send (Mocha) JSON test results to [New Relic Log API](https://docs.newrelic.com/docs/logs/log-api/introduction-log-api).

## Usage

```yaml
jobs:
  test:
    steps:
      # ...
      - name: Run tests
        run: mocha --reporter json --reporter-option="output=results.json"
      - uses: pavelsaman/nr-send-test-results@v1
        with:
          new-relic-license-key: ${{ secrets.NEWRELIC_LICENSE_KEY_TECH }}
```

## Inputs

### new-relic-license-key

New Relic license key for Metric API ingestion

**Required**: true

### test-result-filename

Filename with (Mocha) test results in JSON format.

**Required**: false

**Default**: `./results.json`

### fail-pipeline

Whether to fail the pipeline if there is a problem - e.g. when `test-result-filename` was not found.

**Required**: false

**Default**: `0` (do not fail)

### metric-id

Identification of the metric record.

E.g. a name of a project is a good candidate for this.

**Required**: false

**Default**: `test`

### verbose-log

If set to `1`, prints more info to stdout - data sent to New Relic, GitHub properties. Useful for debugging only.

**Required**: false

**Default**: `0`

### upload-test-artifact

Whether to upload test artifact.

**Required**: false

**Default**: `1` (upload)

### job-id

Custom job id of the job this action was called from.

**Required**: false

## Contributing

Initial setup:

```bash
$ make install
$ make install-git-hooks
```

To format, lint, and test if the action gets built and packaged:

```bash
$ make all
```

You can also manually run [`build.yaml`](https://github.com/pavelsaman/nr-send-test-results/actions/workflows/build.yaml) workflow here on GitHub to go over the same steps.

After testing has taken place, you can add [`v1` tag](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md) to reference the latest stable action.
