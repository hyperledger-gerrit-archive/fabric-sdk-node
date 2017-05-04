/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';

var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('E2E join-channel');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var util = require('util');
var path = require('path');
var fs = require('fs');
var grpc = require('grpc');

var hfc = require('fabric-client');
var EventHub = require('fabric-client/lib/EventHub.js');
var Block = require('fabric-client/lib/Block.js');

var testUtil = require('../../unit/util.js');

var the_user = null;
var tx_id = null;
var nonce = null;

hfc.addConfigFile(path.join(__dirname, './config.json'));
var ORGS = hfc.getConfigSetting('test-network');

var allEventhubs = [];

var _commonProto   = grpc.load(path.join(__dirname, '../../../fabric-client/lib/protos/common/common.proto')).common;
var _configtxProto = grpc.load(path.join(__dirname, '../../../fabric-client/lib/protos/common/configtx.proto')).common;
//
//Attempt to send a request to the orderer with the sendCreateChain method
//
test('\n\n***** End-to-end flow: join channel *****\n\n', function(t) {
	// override t.end function so it'll always disconnect the event hub
	t.end = ((context, ehs, f) => {
		return function() {
			for(var key in ehs) {
				var eventhub = ehs[key];
				if (eventhub && eventhub.isconnected()) {
					t.comment('Disconnecting the event hub');
					eventhub.disconnect();
				}
			}

			f.apply(context, arguments);
		};
	})(t, allEventhubs, t.end);

	joinChannel('org1', t)
	.then(() => {
		t.pass(util.format('Successfully joined peers in organization "%s" to the channel', ORGS['org1'].name));
		return joinChannel('org2', t);
	}, (err) => {
		t.fail(util.format('Failed to join peers in organization "%s" to the channel. %s', ORGS['org1'].name, err.stack ? err.stack : err));
		t.end();
	})
	.then(() => {
		t.pass(util.format('Successfully joined peers in organization "%s" to the channel', ORGS['org2'].name));
		t.end();
	}, (err) => {
		t.fail(util.format('Failed to join peers in organization "%s" to the channel. %s', ORGS['org2'].name), err.stack ? err.stack : err);
		t.end();
	})
	.catch(function(err) {
		t.fail('Failed request. ' + err);
		t.end();
	});
});

function joinChannel(org, t) {
	t.comment(util.format('Calling peers in organization "%s" to join the channel', org));

	//
	// Create and configure the test chain
	//
	var client = new hfc();
	var chain = client.newChain(testUtil.determineChannelName());

	var orgName = ORGS[org].name;

	var targets = [],
		eventhubs = [];

	var caRootsPath = ORGS.orderer.tls_cacerts;
	let data = fs.readFileSync(path.join(__dirname, caRootsPath));
	let caroots = Buffer.from(data).toString();
	var genesis_block = null;

	chain.addOrderer(
		client.newOrderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);

	return hfc.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);

		// TODO - remove... checking to see if orderer admin works
		return testUtil.getOrderAdminSubmitter(client, t);
	}).then((admin) => {
		t.pass('Successfully enrolled orderer \'admin\'');
		nonce = utils.getNonce();
		tx_id = hfc.buildTransactionID(nonce, admin);
		let request = {
			txId : 	tx_id,
			nonce : nonce
		};
		return chain.getGenesisBlock(request);
	}).then((block) =>{
		t.pass('Successfully got the genesis block');
		genesis_block = block;

//		var proto_block = _commonProto.Block.decode(block.toBuffer());
//		var envelope = _commonProto.Envelope.decode(proto_block.data.data[0]);
//		var payload = _commonProto.Payload.decode(envelope.payload);
//		var channel_header = _commonProto.ChannelHeader.decode(payload.header.channel_header);
//		if(channel_header.type != _commonProto.HeaderType.CONFIG) {
//			logger.error('Block must be of type "CONFIG"');
//		}

//		var json_block = Block.decode(block.toBuffer());
//		logger.info('GENESIS BLOCK :: %j',json_block);

//		var config_envelope = _configtxProto.ConfigEnvelope.decode(payload.data);
//		chain.loadConfigEnvelope(config_envelope);


		// get the peer org's admin required to send join channel requests
		client._userContext = null;
		return testUtil.getSubmitter(client, t, true /* get peer org admin */, org);
	}).then((admin) => {
		t.pass('Successfully enrolled org:' + org + ' \'admin\'');
		the_user = admin;

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

					let eh = new EventHub(client);
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

		var eventPromises = [];
		eventhubs.forEach((eh) => {
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(reject, 30000);

				eh.registerBlockEvent((block) => {
					clearTimeout(handle);

					// in real-world situations, a peer may have more than one channels so
					// we must check that this block came from the channel we asked the peer to join
					if(block.data.data.length === 1) {
						// Config block must only contain one transaction
						var envelope = _commonProto.Envelope.decode(block.data.data[0]);
						var payload = _commonProto.Payload.decode(envelope.payload);
						var channel_header = _commonProto.ChannelHeader.decode(payload.header.channel_header);

						if (channel_header.channel_id === testUtil.determineChannelName()) {
							t.pass('The new channel has been successfully joined on peer '+ eh.ep._endpoint.addr);
							resolve();
						}
					}
				});
			});

			eventPromises.push(txPromise);
		});
		nonce = utils.getNonce();
		tx_id = hfc.buildTransactionID(nonce, the_user);
		let request = {
			targets : targets,
			block : genesis_block,
			txId : 	tx_id,
			nonce : nonce
		};
		let sendPromise = chain.joinChannel(request);
		return Promise.all([sendPromise].concat(eventPromises));
	}, (err) => {
		t.fail('Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
	})
	.then((results) => {
		t.comment(util.format('Join Channel R E S P O N S E : %j', results));

		if(results[0] && results[0][0] && results[0][0].response && results[0][0].response.status == 200) {
			t.pass(util.format('Successfully joined peers in organization %s to join the channel', orgName));
		} else {
			t.fail(' Failed to join channel');
			throw new Error('Failed to join channel');
		}
	}, (err) => {
		t.fail('Failed to join channel due to error: ' + err.stack ? err.stack : err);
	});
}

