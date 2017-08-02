// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
import tape = require('tape');

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('E2E instantiate-chaincode');

const e2eUtils = require('./../e2e/e2eUtils.js');
const testUtil = require('../../unit/util.js');

tape('\n\n***** End-to-end flow: query chaincode *****\n\n', async (t: tape.Test) => {

  try {

    const result = await e2eUtils.queryChaincode('org2', 'v0', '300', t);

    if (result) {
      t.pass('Successfully query chaincode on the channel');
    }
    else {
      t.fail('Failed to query chaincode ');
    }

  } catch (err) {
    t.fail('Failed to query chaincode on the channel. ' + err.stack ? err.stack : err);
  }

  t.end();
});
