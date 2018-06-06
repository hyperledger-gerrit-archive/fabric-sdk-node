/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('DISCOVERY');

const tape = require('tape');
const _test = require('tape-promise').default;
const test = _test(tape);

const Client = require('fabric-client');
const util = require('util');
const fs = require('fs');
const path = require('path');

const testUtil = require('../unit/util.js');

test('\n\n***** D I S C O V E R Y  *****\n\n', async function(t) {
	const client = await testUtil.getClientForOrg(t, 'org1');
	client.setConfigSetting('initialize-with-discovery', true);

	const channel = client.getChannel('adminconfig');

	let q_results = await channel.queryInstantiatedChaincodes('peer0.org1.example.com', true);
	const chaincode_id = q_results.chaincodes[0].name;
	const version = q_results.chaincodes[0].version;

	let results = await channel._discover({
		target:'peer0.org1.example.com',
		chaincodes: [chaincode_id],
		config: true
	});

	t.equals(results.msps.OrdererMSP.id, 'OrdererMSP', 'Checking MSP ID');
	t.equals(results.msps.Org1MSP.id, 'Org1MSP', 'Checking MSP ID');
	t.equals(results.msps.Org2MSP.id, 'Org2MSP', 'Checking MSP ID');
	t.equals(results.orderers.OrdererMSP.endpoints[0].host, 'orderer.example.com', 'Checking orderer host');
	t.equals(results.orderers.OrdererMSP.endpoints[0].port, 7050, 'Checking orderer port');
	t.equals(results.peers_by_org.Org1MSP.peers[0].endpoint, 'peer0.org1.example.com:7051', 'Checking peer endpoint');
	t.equals(results.peers_by_org.Org1MSP.peers[0].ledger_height.low, 3, 'Checking peer ledger_height');
	t.equals(results.peers_by_org.Org1MSP.peers[0].chaincodes[0].name, 'example', 'Checking peer chaincode name');
	t.equals(results.peers_by_org.Org1MSP.peers[0].chaincodes[0].version, 'v2', 'Checking peer chaincode version');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].endpoint, 'peer0.org1.example.com:7051', 'Checking peer endpoint');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].ledger_height.low, 3, 'Checking peer ledger_height');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].chaincodes[0].name, chaincode_id, 'Checking peer chaincode name');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].chaincodes[0].version, version, 'Checking peer chaincode version');
	t.equals(results.endorsement_targets.example.layouts[0].G0, 1, 'Checking layout quantities_by_group');
	//logger.info('D I S C O V E R Y   R E S U L T S \n %j', results);

	// try without the target specfied
	results = await channel._discover({
		chaincodes: [chaincode_id],
		config: true
	});

	t.equals(results.msps.OrdererMSP.id, 'OrdererMSP', 'Checking MSP ID');
	t.equals(results.msps.Org1MSP.id, 'Org1MSP', 'Checking MSP ID');
	t.equals(results.msps.Org2MSP.id, 'Org2MSP', 'Checking MSP ID');
	t.equals(results.orderers.OrdererMSP.endpoints[0].host, 'orderer.example.com', 'Checking orderer host');
	t.equals(results.orderers.OrdererMSP.endpoints[0].port, 7050, 'Checking orderer port');
	t.equals(results.peers_by_org.Org1MSP.peers[0].endpoint, 'peer0.org1.example.com:7051', 'Checking peer endpoint');
	t.equals(results.peers_by_org.Org1MSP.peers[0].ledger_height.low, 3, 'Checking peer ledger_height');
	t.equals(results.peers_by_org.Org1MSP.peers[0].chaincodes[0].name, 'example', 'Checking peer chaincode name');
	t.equals(results.peers_by_org.Org1MSP.peers[0].chaincodes[0].version, 'v2', 'Checking peer chaincode version');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].endpoint, 'peer0.org1.example.com:7051', 'Checking peer endpoint');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].ledger_height.low, 3, 'Checking peer ledger_height');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].chaincodes[0].name, 'example', 'Checking peer chaincode name');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].chaincodes[0].version, 'v2', 'Checking peer chaincode version');
	t.equals(results.endorsement_targets.example.layouts[0].G0, 1, 'Checking layout quantities_by_group');

	// This will call the discovery under the covers and load the channel with msps, orderers, and peers
	results = await channel.initialize({asLocalhost: true});

	// check orgs ... actually gets names from the msps loaded
	const orgs = channel.getOrganizations();
	for(let index in orgs) {
		const org = orgs[index].id;
		if(org === 'Org1MSP' || org === 'Org2MSP' || org === 'OrdererMSP') {
			t.pass('Checking call to get organizations on the channel after using the discovery service for ' + org);
		} else {
			t.fail('Checking call to get organizations on the channel after using the discovery service for '+ org);
		}
	}

	t.equals(channel.getOrderers()[0].getUrl(), 'grpcs://localhost:7050', 'Checking orderer url');
	t.equals(channel.getPeers()[0].getUrl(), 'grpcs://localhost:7051', 'Checking peer url');

	q_results = await channel.queryInstantiatedChaincodes(null, true);
	t.equals(q_results.chaincodes[0].name, chaincode_id, 'Checking able to query using a discovered peer');

	const request = {
		preferred: ['peer6.org1.example.com:7077'],
		ignore:['peer9.org2,example.com:8077']
	};
	const tx_id_string = await testUtil.invoke(t, client, channel, request);

	await testUtil.queries(t, client, channel, tx_id_string);

	t.pass('End discovery testing');
	t.end();
});
