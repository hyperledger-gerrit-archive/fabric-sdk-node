// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
import tape = require('tape');

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('E2E instantiate-chaincode');

const e2eUtils = require('./../e2e/e2eUtils.js');
const testUtil = require('../../unit/util.js');

tape('\n\n***** End-to-end flow: invoke transaction to move money *****\n\n', async (t: tape.Test) => {

  try {
    const result = await e2eUtils.invokeChaincode('org2', 'v0', t, false/*useStore*/);

    if (result) {
      t.pass('Successfully invoke transaction chaincode on channel');
      await sleep(5000);
    }
    else {
      t.fail('Failed to invoke transaction chaincode ');
    }

  } catch (err) {
    t.fail('Failed to invoke transaction chaincode on channel. ' + err.stack ? err.stack : err);
  }

  t.end();

});

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
