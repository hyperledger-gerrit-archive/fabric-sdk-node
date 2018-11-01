/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const utils = require('fabric-client/lib/utils.js');


const tape = require('tape');
const _test = require('tape-promise').default;
const test = _test(tape);

const e2eUtils = require('./e2e/e2eUtils.js');
const fs = require('fs');
const path = require('path');

const testUtil = require('../unit/util.js');

const Client = require('fabric-client');
const Orderer = require('fabric-client/lib/Orderer.js');

let ORGS;

const client = new Client();
const org = 'org1';

//
// Orderer via member missing orderer
//
// Attempt to send a request to the orderer with the sendTransaction method
// before the orderer URL was set. Verify that an error is reported when tying
// to send the request.
//
test('\n\n** TEST ** orderer via member missing orderer', (t) => {
	testUtil.resetDefaults();
	utils.setConfigSetting('key-value-store', 'fabric-ca-client/lib/impl/FileKeyValueStore.js');// force for 'gulp test'
	Client.addConfigFile(path.join(__dirname, 'e2e', 'config.json'));
	ORGS = Client.getConfigSetting('test-network');
	const orgName = ORGS[org].name;

	//
	// Create and configure the test channel
	//
	const channel = client.newChannel('testchannel-orderer-member2');
	const cryptoSuite = Client.newCryptoSuite();
	cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
	client.setCryptoSuite(cryptoSuite);

	Client.newDefaultKeyValueStore({
		path: testUtil.KVS
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	}).then(
		() => {
			t.pass('Successfully enrolled user \'admin\'');

			// send to orderer
			return channel.sendTransaction('data');
		},
		(err) => {
			t.fail('Failed to enroll user \'admin\'. ' + err);
			t.end();
		}
	).then(
		(status) => {
			if (status === 0) {
				t.fail('Successfully submitted request, which is bad because the channel is missing orderers.');
			} else {
				t.pass('Successfully tested invalid submission due to missing orderers. Error code: ' + status);
			}

			t.end();
		},
		(err) => {
			t.comment('Error: ' + err);
			t.pass('Successfully tested invalid submission due to missing orderers. Error code: ' + err);
			t.end();
		}
	).catch((err) => {
		t.fail('Failed request. ' + err);
		t.end();
	});
});

//
// Orderer via member null data
//
// Attempt to send a request to the orderer with the sendTransaction method
// with the data set to null. Verify that an error is reported when tying
// to send null data.
//
test('\n\n** TEST ** orderer via member null data', (t) => {
	//
	// Create and configure the test channel
	//
	const channel = client.newChannel('testchannel-orderer-member3');
	const caRootsPath = ORGS.orderer.tls_cacerts;
	const data = fs.readFileSync(path.join(__dirname, 'e2e', caRootsPath));
	const caroots = Buffer.from(data).toString();
	let tlsInfo = null;

	e2eUtils.tlsEnroll(org)
		.then((enrollment) => {
			t.pass('Successfully retrieved TLS certificate');
			tlsInfo = enrollment;
			client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);
			return testUtil.getSubmitter(client, t, org);
		}).then(
			() => {
				t.pass('Successfully enrolled user \'admin\'');

				channel.addOrderer(
					new Orderer(
						ORGS.orderer.url,
						{
							'pem': caroots,
							'ssl-target-name-override': ORGS.orderer['server-hostname']
						}
					)
				);

				// send to orderer
				return channel.sendTransaction(null);
			},
			(err) => {
				t.fail('Failed to enroll user \'admin\'. ' + err);
				t.end();
			}
		).then(
			(status) => {
				if (status === 0) {
					t.fail('Successfully submitted request, which is bad because the submission was missing data');
					t.end();
				} else {
					t.pass('Successfully tested invalid submission due to null data. Error code: ' + status);

					return channel.sendTransaction('some non-null but still bad data');
				}
			},
			(err) => {
				t.pass('Failed to submit. Error code: ' + err);
				t.end();
			}
		).then(
			(status) => {
				if (status === 0) {
					t.fail('Successfully submitted request, which is bad because the submission was using bad data');
					t.end();
				} else {
					t.pass('Successfully tested invalid submission due to bad data. Error code: ' + status);
					t.end();
				}
			},
			(err) => {
				t.pass('Failed to submit. Error code: ' + err);
				t.end();
			}
		).catch((err) => {
			t.pass('Failed request. ' + err);
			t.end();
		});
});

//
// Orderer via member bad orderer address
//
// Attempt to send a request to the orderer with the sendTransaction method
// with the orderer address set to a bad URL. Verify that an error is reported
// when tying to send the request.
//
test('\n\n** TEST ** orderer via member bad request', (t) => {
	//
	// Create and configure the test channel
	//
	const channel = client.newChannel('testchannel-orderer-member4');

	// Set bad orderer address here
	const caRootsPath = ORGS.orderer.tls_cacerts;
	const data = fs.readFileSync(path.join(__dirname, 'e2e', caRootsPath));
	const caroots = Buffer.from(data).toString();
	let tlsInfo = null;

	e2eUtils.tlsEnroll(org)
		.then((enrollment) => {
			t.pass('Successfully retrieved TLS certificate');
			tlsInfo = enrollment;
			client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);
			return testUtil.getSubmitter(client, t, org);
		}).then(
			() => {
				t.pass('Successfully enrolled user \'admin\'');

				channel.addOrderer(
					new Orderer(
						'grpcs://localhost:5199',
						{
							'pem': caroots,
							'clientCert': tlsInfo.certificate,
							'clientKey': tlsInfo.key,
							'ssl-target-name-override': ORGS.orderer['server-hostname']
						}
					)
				);

				// send to orderer
				const request = {
					proposalResponses: 'blah',
					proposal: 'blah'
				};
				return channel.sendTransaction(request);
			},
			(err) => {
				t.fail('Failed to enroll user \'admin\'. ' + err);
				t.end();
			}
		).then(
			(status) => {
				if (status === 0) {
					t.fail('Successfully submitted request, which is bad because request is invalid');
				} else {
					t.pass('Successfully tested invalid submission due to the invalid request. Error code: ' + status);
				}
				t.end();
			},
			(err) => {
				t.comment('Failed to submit. Error: ');
				t.pass('Error :' + err.stack ? err.stack : err);
				t.end();
			}
		).catch((err) => {
			t.comment('Failed to submit orderer request.  Error: ');
			t.pass('Error: ' + err);
			t.end();
		});
});
