// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario

import tape = require('tape');

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('E2E instantiate-chaincode');

const e2eUtils = require('./../e2e/e2eUtils.js');
const testUtil = require('../../unit/util.js');

tape('\n\n***** End-to-end flow: instantiate chaincode *****\n\n', async (t: tape.Test) => {

  try {
    const result = await e2eUtils.instantiateChaincode('org1', testUtil.CHAINCODE_PATH, 'v0', false, t);

    if (result) {
      t.pass('Successfully instantiated chaincode on the channel');
      await sleep(5000);
      logger.debug('Successfully slept 5s to wait for chaincode instantiate to be completed and committed in all peers');
    }
    else {
      t.fail('Failed to instantiate chaincode ');
    }
  } catch (err) {
    t.fail('Failed to instantiate chaincode on the channel. ' + err.stack ? err.stack : err);
  }

  t.end();

});

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
