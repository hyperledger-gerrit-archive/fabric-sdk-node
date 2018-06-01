/**
 * Copyright 2016-2017 IBM All Rights Reserved.
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

const tape = require('tape');
const _test = require('tape-promise');
const test = _test(tape);



const Client = require('fabric-client');
const testutil = require('./util.js');

const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('channel');
const DefaultEndorsementHandler = require('fabric-client/lib/impl/DefaultEndorsementHandler.js');

const results = {
	msps:{
		OrdererMSP:{
			id:'OrdererMSP',
			orgs:[ ],
			rootCerts:'-----BEGIN CERTIFICATE-----    -----END CERTIFICATE-----\n',
			intermediateCerts:'',
			admins:'-----BEGIN CERTIFICATE-----    -----END CERTIFICATE-----\n',
			tls_intermediate_certs:''
		},
		Org2MSP:{
			id:'Org2MSP',
			orgs:[ ],
			rootCerts:'-----BEGIN CERTIFICATE-----    -----END CERTIFICATE-----\n',
			intermediateCerts:'',
			admins:'-----BEGIN CERTIFICATE-----    -----END CERTIFICATE-----\n',
			tls_intermediate_certs:''
		},
		Org1MSP:{
			id:'Org1MSP',
			orgs:[ ],
			rootCerts:'-----BEGIN CERTIFICATE-----    -----END CERTIFICATE-----\n',
			intermediateCerts:'',
			admins:'-----BEGIN CERTIFICATE-----    -----END CERTIFICATE-----\n',
			tls_intermediate_certs:''
		},
	},
	orderers:{
		OrdererMSP:{
			endpoints:[
				{
					host:'orderer.example.com',
					port:7050,
					name:'orderer.example.com'
				}
			]
		}
	},
	peers_by_org:{
		Org1MSP:{
			peers:[
				{
					mspid:'Org1MSP',
					endpoint:'peer0.org1.example.com:7051',
					ledger_height:4,
					chaincodes:[{name:'example',version:'v2'}],
					name:'peer0.org1.example.com'
				}
			]
		},
		Org2MSP:{
			peers:[
				{
					mspid:'Org2MSP',
					endpoint:'peer0.org2.example.com:7051',
					ledger_height:4,
					chaincodes:[{name:'example',version:'v2'}],
					name:'peer0.org2.example.com'
				}
			]
		}
	},
	endorsement_targets:{
		example:{
			groups:{
				G0:{
					peers:[
						{
							mspid:'Org1MSP',
							endpoint:'peer0.org1.example.com:7051',
							ledger_height:4,
							chaincodes:[{name:'example',version:'v2'}],
							name:'peer0.org1.example.com'
						},
						{
							mspid:'Org2MSP',
							endpoint:'peer0.org2.example.com:7051',
							ledger_height:4,
							chaincodes:[{name:'example',version:'v2'}],
							name:'peer0.org2.example.com'
						},
					]
				}
			},
			layouts:[{G0:1}]
		}
	}
};


test('\n\n ** DefaultEndorsementHandler - test **\n\n', async (t) => {
	testutil.resetDefaults();
	let channelName = 'mychannel';
	let chaincode_id = 'example';
	const client = new Client();

	try {
		const handler = new DefaultEndorsementHandler();
		await handler.endorse();

	} catch(error) {
		if(error.toString().indexOf('all')) {
			t.pass('Check for :Missing all required input request parameters.');
		} else {
			t.fail('Check for :Missing all required input request parameters.');
		}
	}

	try {
		const handler = new DefaultEndorsementHandler();
		await handler.endorse({});

	} catch(error) {
		if(error.toString().indexOf('chaincodeId')) {
			t.pass('Check for :Missing chaincodeId input request parameter.');
		} else {
			t.fail('Check for :Missing chaincodeId input request parameter.');
		}
	}

	const handler = new DefaultEndorsementHandler();
	const request = {};
	request.discovery_results = results;
	request.chaincodeId = chaincode_id;
	const endorsement_results = await handler.endorse(request);

	t.end();
});
