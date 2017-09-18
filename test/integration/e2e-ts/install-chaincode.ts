// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario

import tape = require('tape');

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('E2E install-chaincode');

const e2eUtils = require('./../e2e/e2eUtils.js');
const testUtil = require('../../unit/util.js');

tape('\n\n***** End-to-end flow: chaincode install *****\n\n', async (t: tape.Test) => {
  testUtil.setupChaincodeDeploy();

  try {
    await e2eUtils.installChaincode('org1', testUtil.CHAINCODE_PATH, 'v0', t, true);
    t.pass('Successfully installed chaincode in peers of organization "org1"');
  } catch (err) {
    t.fail('Failed to install chaincode in peers of organization "org1". ' + err.stack ? err.stack : err);
    logger.error('Failed to install chaincode in peers of organization "org1". ');
  }

  try {
    await e2eUtils.installChaincode('org2', testUtil.CHAINCODE_PATH, 'v0', t, true);
    t.pass('Successfully installed chaincode in peers of organization "org2"');
  } catch (err) {
    t.fail('Failed to install chaincode in peers of organization "org2". ' + err.stack ? err.stack : err);
    logger.error('Failed to install chaincode in peers of organization "org2". ');
  }

  t.end();
});
