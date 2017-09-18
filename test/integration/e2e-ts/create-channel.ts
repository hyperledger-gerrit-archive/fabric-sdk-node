import * as path from 'path';
import * as fs from 'fs';
import tape = require('tape');

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('E2E create-channel');

import Client = require('fabric-client');

const grpc = require('grpc');

const testUtil = require('../../unit/util.js');
const e2eUtils = require('../e2e/e2eUtils.js');

const _commonProto = grpc.load(path.join(__dirname, '../../../fabric-client/lib/protos/common/common.proto')).common;
const _configtxProto = grpc.load(path.join(__dirname, '../../../fabric-client/lib/protos/common/configtx.proto')).common;

let the_user = null;

let ORGS;

let channel_name = 'mychannel';
// can use "channel=<name>" to control the channel name from command line
if (process.argv.length > 2) {
  if (process.argv[2].indexOf('channel=') === 0) {
    channel_name = process.argv[2].split('=')[1];
  }
}

//
//Attempt to send a request to the orderer with the createChannel method
//
tape('\n\n***** SDK Built config update  create flow  *****\n\n', async function(t: tape.Test) {
  testUtil.resetDefaults();

  Client.addConfigFile(path.join(__dirname, './../e2e/config.json'));

  ORGS = Client.getConfigSetting('test-network');

  // Create and configure the test channel
  const client = new Client();

  const caRootsPath = ORGS.orderer.tls_cacerts;
  const data = fs.readFileSync(path.join(__dirname, caRootsPath));
  const caroots = Buffer.from(data).toString();

  const orderer = client.newOrderer(
    ORGS.orderer.url,
    {
      'pem': caroots,
      'ssl-target-name-override': ORGS.orderer['server-hostname']
    }
  );

  const TWO_ORG_MEMBERS_AND_ADMIN = [{
    role: {
      name: 'member',
      mspId: 'Org1MSP'
    }
  }, {
      role: {
        name: 'member',
        mspId: 'Org2MSP'
      }
    }, {
      role: {
        name: 'admin',
        mspId: 'OrdererMSP'
      }
    }];

  const ONE_OF_TWO_ORG_MEMBER = {
    identities: TWO_ORG_MEMBERS_AND_ADMIN,
    policy: {
      '1-of': [{ 'signed-by': 0 }, { 'signed-by': 1 }]
    }
  };

  const ACCEPT_ALL: any = {
    identities: [],
    policy: {
      '0-of': []
    }
  };

  let config: any = null;
  let signatures: any = [];

  // Acting as a client in org1 when creating the channel
  const org = ORGS.org1.name;

  utils.setConfigSetting('key-value-store', 'fabric-client/lib/impl/FileKeyValueStore.js');

  try {
    const store = await Client.newDefaultKeyValueStore({
      path: testUtil.storePathForOrg(org)
    });

    client.setStateStore(store);

    const cryptoSuite = Client.newCryptoSuite();
    cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({ path: testUtil.storePathForOrg(org) }));
    client.setCryptoSuite(cryptoSuite);

    await testUtil.getOrderAdminSubmitter(client, t);

    t.pass('Successfully enrolled user \'admin\' for orderer');

    // use the config update created by the configtx tool
    const envelope_bytes = fs.readFileSync(path.join(__dirname, '../../fixtures/channel/mychannel.tx'));
    config = client.extractChannelConfig(envelope_bytes);

    t.pass('Successfull extracted the config update from the configtx envelope');

    // client._userContext = null;
    await testUtil.getSubmitter(client, t, true /*get the org admin*/, 'org1');

    t.pass('Successfully enrolled user \'admin\' for org1');

    // sign the config
    let signature = client.signChannelConfig(config);
    // convert signature to a storable string
    // fabric-client SDK will convert back during create
    const string_signature = signature.toBuffer().toString('hex');
    t.pass('Successfully signed config update');
    // collect signature from org1 admin
    // TODO: signature counting against policies on the orderer
    // at the moment is being investigated, but it requires this
    // weird double-signature from each org admin
    signatures.push(string_signature);
    signatures.push(string_signature);

    // make sure we do not reuse the user
    // client._userContext = null;
    await testUtil.getSubmitter(client, t, true /*get the org admin*/, 'org2');

    t.pass('Successfully enrolled user \'admin\' for org2');

    // sign the config
    signature = client.signChannelConfig(config);
    t.pass('Successfully signed config update');

    // collect signature from org2 admin
    // TODO: signature counting against policies on the orderer
    // at the moment is being investigated, but it requires this
    // weird double-signature from each org admin
    signatures.push(signature);
    signatures.push(signature);

    // make sure we do not reuse the user
    // client._userContext = null;
    the_user = await testUtil.getOrderAdminSubmitter(client, t);

    t.pass('Successfully enrolled user \'admin\' for orderer');

    // sign the config
    signature = client.signChannelConfig(config);
    t.pass('Successfully signed config update');

    // collect signature from orderer org admin
    // TODO: signature counting against policies on the orderer
    // at the moment is being investigated, but it requires this
    // weird double-signature from each org admin
    signatures.push(signature);
    signatures.push(signature);

    logger.debug('\n***\n done signing \n***\n');

    // build up the create request
    const tx_id = client.newTransactionID();
    const request = {
      config: config,
      signatures: signatures,
      name: channel_name,
      orderer: orderer,
      txId: tx_id
    };

    const result = await client.createChannel(request);

    logger.debug('\n***\n completed the create \n***\n');

    logger.debug(' response ::%j', result);
    t.pass('Successfully created the channel.');
    if (result.status && result.status === 'SUCCESS') {
      await e2eUtils.sleep(5000);
      t.pass('Successfully waited to make sure new channel was created.');
    } else {
      t.fail('Failed to create the channel. ');
    }

    t.end();

  } catch (err) {
    t.fail('Failed to create the channel: ' + err.stack ? err.stack : err);
    t.end();
  }

});
