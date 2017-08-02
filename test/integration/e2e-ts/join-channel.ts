import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs';
import tape = require('tape');

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('E2E join-channel');

import Client = require('fabric-client');

const testUtil = require('../../unit/util.js');

let the_user = null;
let tx_id = null;

let ORGS: any;

const allEventhubs: any = [];
//
//Attempt to send a request to the orderer with the createChannel method
//
tape('\n\n***** End-to-end flow: join channel *****\n\n', async function(t: tape.Test) {
  Client.addConfigFile(path.join(__dirname, './../e2e/config.json'));
  ORGS = Client.getConfigSetting('test-network');

  // override t.end function so it'll always disconnect the event hub
  t.end = ((context, ehs, f) => {
    return function() {
      for (var key in ehs) {
        var eventhub = ehs[key];
        if (eventhub && eventhub.isconnected()) {
          logger.debug('Disconnecting the event hub');
          eventhub.disconnect();
        }
      }

      f.apply(context, arguments);
    };
  })(t, allEventhubs, t.end);

  try {
    await joinChannel('org1', t);
    t.pass(util.format('Successfully joined peers in organization "%s" to the channel', ORGS['org1'].name));
  } catch (err) {
    t.fail(util.format('Failed to join peers in organization "%s" to the channel. %s', ORGS['org1'].name, err.stack ? err.stack : err));
    t.end();
  }

  try {
    await joinChannel('org2', t);
    t.pass(util.format('Successfully joined peers in organization "%s" to the channel', ORGS['org2'].name));
  } catch (err) {
    t.fail(util.format('Failed to join peers in organization "%s" to the channel. %s', ORGS['org2'].name, err.stack ? err.stack : err));
  }

  t.end();

});

async function joinChannel(org: string, t: tape.Test) {
  const channel_name = Client.getConfigSetting('E2E_CONFIGTX_CHANNEL_NAME', testUtil.END2END.channel);

  // Create and configure the test channel
  const client = new Client();
  const channel = client.newChannel(channel_name);

  const orgName = ORGS[org].name;

  const targets: any = [],
    eventhubs: EventHub[] = [];

  const caRootsPath = ORGS.orderer.tls_cacerts;
  let data = fs.readFileSync(path.join(__dirname, caRootsPath));
  const caroots = Buffer.from(data).toString();
  let genesis_block: any = null;

  channel.addOrderer(
    client.newOrderer(
      ORGS.orderer.url,
      {
        'pem': caroots,
        'ssl-target-name-override': ORGS.orderer['server-hostname']
      }
    )
  );

  const store = await Client.newDefaultKeyValueStore({
    path: testUtil.storePathForOrg(orgName)
  });

  client.setStateStore(store);

  await testUtil.getOrderAdminSubmitter(client, t);

  t.pass('Successfully enrolled orderer \'admin\'');

  tx_id = client.newTransactionID();

  let request = {
    txId: tx_id
  };

  genesis_block = await channel.getGenesisBlock(request);

  t.pass('Successfully got the genesis block');

  // get the peer org's admin required to send join channel requests
  //client._userContext = null;

  the_user = await testUtil.getSubmitter(client, t, true /* get peer org admin */, org);

  t.pass('Successfully enrolled org:' + org + ' \'admin\'');

  for (let key in ORGS[org]) {
    if (ORGS[org].hasOwnProperty(key)) {
      if (key.indexOf('peer') === 0) {
        data = fs.readFileSync(path.join(__dirname, ORGS[org][key]['tls_cacerts']));
        targets.push(
          client.newPeer(
            ORGS[org][key].requests,
            {
              pem: Buffer.from(data).toString(),
              'ssl-target-name-override': ORGS[org][key]['server-hostname']
            }
          )
        );

        let eh = client.newEventHub();
        eh.setPeerAddr(
          ORGS[org][key].events,
          {
            pem: Buffer.from(data).toString(),
            'ssl-target-name-override': ORGS[org][key]['server-hostname']
          }
        );
        eh.connect();
        eventhubs.push(eh);
        allEventhubs.push(eh);
      }
    }
  }

  const eventPromises: Promise<any>[] = [];
  eventhubs.forEach((eh) => {
    let txPromise = new Promise((resolve, reject) => {
      let handle = setTimeout(reject, 30000);

      eh.registerBlockEvent((block) => {
        clearTimeout(handle);

        // in real-world situations, a peer may have more than one channel so
        // we must check that this block came from the channel we asked the peer to join
        if (block.data.data.length === 1) {
          // Config block must only contain one transaction
          var channel_header = block.data.data[0].payload.header.channel_header;
          if (channel_header.channel_id === channel_name) {
            t.pass('The new channel has been successfully joined on peer ' + eh.getPeerAddr());
            resolve();
          }
          else {
            t.fail('The new channel has not been succesfully joined');
            reject();
          }
        }
      });
    });

    eventPromises.push(txPromise);
  });

  tx_id = client.newTransactionID();

  const sendPromise = channel.joinChannel({
    targets: targets,
    block: genesis_block,
    txId: tx_id
  });

  const results = await Promise.all([sendPromise].concat(eventPromises));

  logger.debug(util.format('Join Channel R E S P O N S E : %j', results));

  if (results[0] && results[0][0] && results[0][0].response && results[0][0].response.status == 200) {
    t.pass(util.format('Successfully joined peers in organization %s to join the channel', orgName));
  } else {
    t.fail(' Failed to join channel');
    throw new Error('Failed to join channel');
  }
};
