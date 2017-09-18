// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
import tape = require('tape');

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('E2E instantiate-chaincode');

const e2eUtils = require('./../e2e/e2eUtils.js');
const testUtil = require('../../unit/util.js');

tape('\n\n***** U P G R A D E flow: chaincode install *****\n\n', async (t: tape.Test) => {
  testUtil.setupChaincodeDeploy();

  try {
    await e2eUtils.installChaincode('org1', testUtil.CHAINCODE_UPGRADE_PATH, 'v1', t, true);
    t.pass('Successfully installed chaincode in peers of organization "org1"');
  } catch (err) {
    t.fail('Failed to install chaincode in peers of organization "org1". ' + err.stack ? err.stack : err);
  }

  try {
    await e2eUtils.installChaincode('org2', testUtil.CHAINCODE_UPGRADE_PATH, 'v1', t, true);
    t.pass('Successfully installed chaincode in peers of organization "org2"');
  } catch (err) {
    t.fail('Failed to install chaincode in peers of organization "org2". ' + err.stack ? err.stack : err);
  }

  t.end();
});

tape('\n\n***** U P G R A D E flow: upgrade chaincode *****\n\n', async (t: tape.Test) => {

  try {
    const result = await e2eUtils.instantiateChaincode('org1', testUtil.CHAINCODE_UPGRADE_PATH, 'v1', true, t);

    if (result) {
      t.pass('Successfully upgrade chaincode on the channel');
    }
    else {
      t.fail('Failed to upgrade chaincode ');
    }

  } catch (err) {
    t.fail('Failed to upgrade chaincode on the channel' + err.stack ? err.stack : err);
  }

  t.end();

});

tape('\n\n***** U P G R A D E flow: invoke transaction to move money *****\n\n', async (t: tape.Test) => {

  try {
    const result = await e2eUtils.invokeChaincode('org2', 'v1', t);

    if (result) {
      t.pass('Successfully invoke transaction chaincode on the channel');
    }
    else {
      t.fail('Failed to invoke transaction chaincode ');
    }

  } catch (err) {
    t.fail('Failed to invoke transaction chaincode on the channel' + err.stack ? err.stack : err);
  }

  t.end();

});

tape('\n\n***** U P G R A D E flow: query chaincode *****\n\n', async (t: tape.Test) => {

  try {

    const result = await e2eUtils.queryChaincode('org2', 'v1', '410', t);

    if (result) {
      t.pass('Successfully query chaincode on the channel');
    }
    else {
      t.fail('Failed to query chaincode ');
    }

  } catch (err) {
    t.fail('Failed to query chaincode on the channel' + err.stack ? err.stack : err);
  }

  t.end();
});

tape('\n\n***** TransientMap Support in Proposals *****\n\n', async (t: tape.Test) => {

  var transient = {
    'test': Buffer.from('dummyValue') // string <-> byte[]
  };

  try {

    const result = await e2eUtils.queryChaincode('org2', 'v1', '410', t, transient);

    if (result) {
      t.pass('Successfully verified transient map values');
    }
    else {
      t.fail('Failed to test transientMap support');
    }

  } catch (err) {
    t.fail('Failed to query chaincode on the channel' + err.stack ? err.stack : err);
  }

  t.end();

});
