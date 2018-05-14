/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('DISCOVERY');

const tape = require('tape');
const _test = require('tape-promise');
const test = _test(tape);

const Client = require('fabric-client');
const util = require('util');
const fs = require('fs');
const path = require('path');

const testUtil = require('../unit/util.js');

test('\n\n***** D I S C O V E R Y  *****\n\n', async function(t) {
	const client = await getClientForOrg(t, 'org1');
	const channel = client.getChannel('adminconfig');

	const chaincodes = await channel.queryInstantiatedChaincodes('peer0.org1.example.com', true);
	logger.info(' Chaincodes %j', chaincodes);

	let results = await channel.discover({
		target:'peer0.org1.example.com',
		chaincodeId: 'example' //to get a chaincode query
	});

	t.equals(results.config.msps.OrdererMSP.id, 'OrdererMSP', 'Checking MSP ID');
	t.equals(results.config.msps.Org1MSP.id, 'Org1MSP', 'Checking MSP ID');
	t.equals(results.config.msps.Org2MSP.id, 'Org2MSP', 'Checking MSP ID');
	t.equals(results.config.orderers.OrdererMSP.endpoints[0].host, 'orderer.example.com', 'Checking orderer host');
	t.equals(results.config.orderers.OrdererMSP.endpoints[0].port, 7050, 'Checking orderer port');
	t.equals(results.peers_by_org.Org1MSP.peers[0].endpoint, 'peer0.org1.example.com:7051', 'Checking peer endpoint');
	t.equals(results.peers_by_org.Org1MSP.peers[0].ledger_height.low, 3, 'Checking peer ledger_height');
	t.equals(results.peers_by_org.Org1MSP.peers[0].chaincodes[0].name, 'example', 'Checking peer chaincode name');
	t.equals(results.peers_by_org.Org1MSP.peers[0].chaincodes[0].version, 'v2', 'Checking peer chaincode version');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].endpoint, 'peer0.org1.example.com:7051', 'Checking peer endpoint');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].ledger_height.low, 3, 'Checking peer ledger_height');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].chaincodes[0].name, 'example', 'Checking peer chaincode name');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].chaincodes[0].version, 'v2', 'Checking peer chaincode version');
	t.equals(results.endorsement_targets.example.layouts[0].quantities_by_group.G0, 1, 'Checking layout quantities_by_group');
	//logger.info('D I S C O V E R Y   R E S U L T S \n %j', results);

	// try without the target specfied
	results = await channel.discover({
		chaincodeId: 'example' //to get a chaincode query
	});

	t.equals(results.config.msps.OrdererMSP.id, 'OrdererMSP', 'Checking MSP ID');
	t.equals(results.config.msps.Org1MSP.id, 'Org1MSP', 'Checking MSP ID');
	t.equals(results.config.msps.Org2MSP.id, 'Org2MSP', 'Checking MSP ID');
	t.equals(results.config.orderers.OrdererMSP.endpoints[0].host, 'orderer.example.com', 'Checking orderer host');
	t.equals(results.config.orderers.OrdererMSP.endpoints[0].port, 7050, 'Checking orderer port');
	t.equals(results.peers_by_org.Org1MSP.peers[0].endpoint, 'peer0.org1.example.com:7051', 'Checking peer endpoint');
	t.equals(results.peers_by_org.Org1MSP.peers[0].ledger_height.low, 3, 'Checking peer ledger_height');
	t.equals(results.peers_by_org.Org1MSP.peers[0].chaincodes[0].name, 'example', 'Checking peer chaincode name');
	t.equals(results.peers_by_org.Org1MSP.peers[0].chaincodes[0].version, 'v2', 'Checking peer chaincode version');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].endpoint, 'peer0.org1.example.com:7051', 'Checking peer endpoint');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].ledger_height.low, 3, 'Checking peer ledger_height');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].chaincodes[0].name, 'example', 'Checking peer chaincode name');
	t.equals(results.endorsement_targets.example.groups.G0.peers[0].chaincodes[0].version, 'v2', 'Checking peer chaincode version');
	t.equals(results.endorsement_targets.example.layouts[0].quantities_by_group.G0, 1, 'Checking layout quantities_by_group');

	t.pass('Successfully completed testing');
	t.end();
});

async function getClientForOrg(t, org) {
	// build a 'Client' instance that knows of a network
	//  this network config does not have the client information, we will
	//  load that later so that we can switch this client to be in a different
	//  organization
	const client = Client.loadFromConfig('test/fixtures/network-ad.yaml');
	t.pass('Successfully loaded a network configuration');

	// load the client information for this organization
	// this file only has the client section
	client.loadFromConfig('test/fixtures/'+ org +'.yaml');
	t.pass('Successfully loaded client section of network config for organization:'+ org);
	if(client._adminSigningIdentity) {
		t.pass('Successfully assigned an admin idenity to this client');
	} else {
		t.fail('Failed to assigne an admin idenity to this client');
	}

	// tell this client instance where the state and key stores are located
	await client.initCredentialStores();
	t.pass('Successfully created the key value store  and crypto store based on the config and network config');

	// the network is using mutual TLS, get the client side certs from the CA
	await getTlsCACerts(t, client, org);

	return client;
}

async function getTlsCACerts(t, client) {
	// get the CA associated with this client's organization
	// ---- this must only be run after the client has been loaded with a
	// client section of the connection profile
	const caService = client.getCertificateAuthority();
	t.pass('Successfully got the CertificateAuthority from the client');

	const request = {
		enrollmentID: 'admin',
		enrollmentSecret: 'adminpw',
		profile: 'tls'
	};
	const enrollment = await caService.enroll(request);

	t.pass('Successfully called the CertificateAuthority to get the TLS material');
	const key = enrollment.key.toBytes();
	const cert = enrollment.certificate;

	// set the material on the client to be used when building endpoints for the user
	client.setTlsClientCertAndKey(cert, key);

	return;
}
