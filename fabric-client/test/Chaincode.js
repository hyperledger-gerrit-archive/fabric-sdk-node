/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const path = require('path');
const rewire = require('rewire');

const Chaincode = rewire('../lib/Chaincode');
const Client = require('../lib/Client');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const should = chai.should();
const expect = chai.expect;
chai.use(chaiAsPromised);

const lifecycle_protos = require('fabric-protos').lifecycle;

function propertiesToBeEqual(obj, properties, value) {
	properties.forEach((prop) => {
		if (obj.hasOwnProperty(prop)) {
			should.equal(obj[prop], value);
		} else {
			should.fail();
		}
	});
}

function propertiesToBeNull(obj, properties) {
	return propertiesToBeEqual(obj, properties, null);
}

function propertiesToBeInstanceOf(obj, properties, clazz) {
	properties.forEach((prop) => {
		if (obj.hasOwnProperty(prop)) {
			obj[prop].should.be.instanceof(clazz);
		} else {
			should.fail();
		}
	});
}

describe('Chaincode', () => {
	let sandbox;
	let revert;
	let FakeLogger;

	const ENDORSEMENT_POLICY = {
		identities: [
			{role: {name: 'member', mspId: 'org1'}},
			{role: {name: 'member', mspId: 'org2'}}
		],
		policy: {
			'1-of': [{'signed-by': 0}, {'signed-by': 1}]
		}
	};

	const COLLECTION_CONFIG =
		[{
			name: 'detailCol',
			policy: {
				identities: [
					{role: {name: 'member', mspId: 'Org1MSP'}},
					{role: {name: 'member', mspId: 'Org2MSP'}}
				],
				policy: {
					'1-of': [
						{'signed-by': 0},
						{'signed-by': 1}
					]
				}
			},
			requiredPeerCount: 1,
			maxPeerCount: 1,
			blockToLive: 100
		}];

	beforeEach(() => {
		revert = [];
		sandbox = sinon.createSandbox();

		FakeLogger = {
			debug: () => { },
			error: () => { }
		};
		sandbox.stub(FakeLogger);
		revert.push(Chaincode.__set__('logger', FakeLogger));
	});

	afterEach(() => {
		if (revert.length) {
			revert.forEach(Function.prototype.call, Function.prototype.call);
		}
		sandbox.restore();
	});

	describe('#constructor', () => {
		it('should require a name', () => {
			(() => {
				new Chaincode();
			}).should.throw('Missing name parameter');
		});

		it('should require a version', () => {
			(() => {
				new Chaincode('name');
			}).should.throw('Missing version parameter');
		});

		it('should require a client', () => {
			(() => {
				new Chaincode('name', 'v1');
			}).should.throw('Missing client parameter');
		});
		
		it('should create an instance and define the correct properties', () => {
			const client = new Client();
			const chaincode = new Chaincode('mychaincode', 'v1', client);
			propertiesToBeNull(chaincode, ['_package', '_hash', '_endorsement_policy', '_endorsement_policy_json', '_collection_config_proto', '_collection_config_json']);
			propertiesToBeInstanceOf(chaincode, ['_client'], Client);
			chaincode._name.should.equal('mychaincode');
			chaincode._version.should.equal('v1');
		});
	});

	describe('#toString', () => {
		it('should get the object contents in string form', () => {
			const client = new Client();
			const chaincode = new Chaincode('mychaincode', 'v1', client);
			const value = chaincode.toString();
			should.equal(value, 'Chaincode : {name : mychaincode, version : v1, sequence : 1, hash : null}');
		});
	});

	describe('#...Getters and Setters and Has-ers', () => {
		const client = new Client();
		let chaincode;

		beforeEach(() => {
			chaincode = new Chaincode('mychaincode', 'v1', client);
		});

		it('should be able to stack all setters', () => {
			const name = chaincode
				.setSequence(10)
				.setChaincodePath('/path')
				.addCollectionConfig(COLLECTION_CONFIG)
				.setEndorsementPolicy(ENDORSEMENT_POLICY)
				.setGoLangPath('/path')
				.setMetadataPath('/path')
				.setPackage('package')
				.setType('node')
				.setHash('hash')
				.setInitRequired(true)
				.getName();
			should.equal(name, 'mychaincode');
		});

		it('should get the name', () => {
			const value = chaincode.getName();
			should.equal(value, 'mychaincode');
		});

		it('should get the version', () => {
			const value = chaincode.getVersion();
			should.equal(value, 'v1');
		});

		it('should get the sequence', () => {
			const value = chaincode.getSequence();
			should.equal(value, 1);
		});

		it('should set the sequence', () => {
			chaincode.setSequence(9);
			chaincode._sequence.should.equal(9);
		});

		it('should get error on empty sequence', () => {
			(() => {
				chaincode.setSequence();
			}).should.throw('Sequence value must be an integer greater than zero');
		});

		it('should get error on null sequence', () => {
			(() => {
				chaincode.setSequence(null);
			}).should.throw('Sequence value must be an integer greater than zero');
		});

		it('should get error on character sequence', () => {
			(() => {
				chaincode.setSequence('aa');
			}).should.throw('Sequence value must be an integer greater than zero');
		});

		it('should get error on zero sequence', () => {
			(() => {
				chaincode.setSequence(0);
			}).should.throw('Sequence value must be an integer greater than zero');
		});

		it('should get error on negative sequence', () => {
			(() => {
				chaincode.setSequence(-1);
			}).should.throw('Sequence value must be an integer greater than zero');
		});

		it('should get error on floating point sequence', () => {
			(() => {
				chaincode.setSequence(2.2);
			}).should.throw('Sequence value must be an integer greater than zero');
		});

		it('should get error on character numbers sequence', () => {
			(() => {
				chaincode.setSequence('1');
			}).should.throw('Sequence value must be an integer greater than zero');
		});

		it('should get the package', () => {
			const value = chaincode.getPackage();
			should.equal(value, null);
		});

		it('should set the package', () => {
			chaincode.setPackage('DUMMY');
			chaincode._package.should.equal('DUMMY');
		});

		it('check the hasPackage true', () => {
			chaincode._package = {};
			const check = chaincode.hasPackage();
			should.equal(check, true);
		});

		it('check the hasPackage false', () => {
			const check = chaincode.hasPackage();
			should.equal(check, false);
		});

		it('check the getHash', () => {
			chaincode._hash = 'hash';
			const check = chaincode.getHash();
			should.equal(check, 'hash');
		});

		it('check the hasHash true', () => {
			chaincode._hash = 'hash';
			const check = chaincode.hasHash();
			should.equal(check, true);
		});

		it('check the hasHash false', () => {
			const check = chaincode.hasHash();
			should.equal(check, false);
		});

		it('should get error on bad chaincode type', () => {
			(() => {
				chaincode.setType('bad');
			}).should.throw('Chaincode type is not a known type bad');
		});

		it('check the type setter and getter', () => {
			chaincode.setType('GOLANG');
			should.equal(chaincode._type, 'golang');
			const type = chaincode.getType();
			should.equal(type, 'golang');
		});

		it('check the type setter and getter', () => {
			chaincode.setType('node');
			should.equal(chaincode._type, 'node');
			const type = chaincode.getType();
			should.equal(type, 'node');
		});

		it('check the type setter and getter', () => {
			chaincode.setType('java');
			should.equal(chaincode._type, 'java');
			const type = chaincode.getType();
			should.equal(type, 'java');
		});

		it('check the chaincode path setter and getter', () => {
			const my_path = '/mypath';
			chaincode.setChaincodePath(my_path);
			should.equal(chaincode._chaincode_path, my_path);
			const chaincode_path = chaincode.getChaincodePath();
			should.equal(chaincode_path, my_path);
		});

		it('check the metadata path setter and getter', () => {
			const my_path = '/mypath';
			chaincode.setMetadataPath(my_path);
			should.equal(chaincode._metadata_path, my_path);
			const metadata_path = chaincode.getMetadataPath();
			should.equal(metadata_path, my_path);
		});

		it('check the golang path setter and getter', () => {
			const my_path = '/mypath';
			chaincode.setGoLangPath(my_path);
			should.equal(chaincode._golang_path, my_path);
			const golang_path = chaincode.getGoLangPath();
			should.equal(golang_path, my_path);
		});

		it('check the endorsement policy getter', () => {
			chaincode._endorsement_policy = Buffer.from('abc');
			const serialzed_policy = chaincode.getEndorsementPolicy();
			should.equal(serialzed_policy.length, 3);
		});

		it('check the endorsement policy definition getter', () => {
			chaincode._endorsement_policy_json = ENDORSEMENT_POLICY;
			const policy_def = chaincode.getEndorsementPolicyDefinition();
			should.equal(JSON.stringify(policy_def), JSON.stringify(ENDORSEMENT_POLICY));
		});

		it('check the endorsement policy getter', () => {
			chaincode.setEndorsementPolicyDefinition(ENDORSEMENT_POLICY);
			should.equal(JSON.stringify(chaincode._endorsement_policy_json), JSON.stringify(ENDORSEMENT_POLICY));
		});

		it('should get the init required', () => {
			const value = chaincode.getInitRequired();
			should.equal(value, false);
		});

		it('should set the init required', () => {
			chaincode.setInitRequired(true);
			chaincode._init_required.should.equal(true);
		});
	});

	describe('#_getHashFromResponse', () => {
		it('should get the correct hash', () => {
			const client = new Client();
			const chaincode = new Chaincode('mychaincode', 'v1', client);
			const installChaincodeResult = new lifecycle_protos.InstallChaincodeResult();
			installChaincodeResult.setHash(Buffer.from('hash'));
			const response = {};
			response.payload = installChaincodeResult.toBuffer();
			const hash = chaincode._getHashFromResponse(response);
			should.equal(hash.toString(), Buffer.from('hash').toString());
		});
	});

	describe('#setEndorsementPolicyDefinition', () => {
		const client = new Client();
		let chaincode;

		beforeEach(() => {
			chaincode = new Chaincode('mychaincode', 'v1', client);
		});

		it('should require a endorsement policy', () => {
			(() => {
				chaincode.setEndorsementPolicyDefinition();
			}).should.throw('The endorsement policy is not valid');
		});

		it('should require a valid policy', () => {
			(() => {
				chaincode.setEndorsementPolicyDefinition({});
			}).should.throw('Invalid policy, missing the "identities" property');
		});

		it('should set the endorsement policy using an object', () => {
			chaincode.setEndorsementPolicyDefinition(ENDORSEMENT_POLICY);
			chaincode._endorsement_policy_json.should.equal(ENDORSEMENT_POLICY);
		});
	});

	describe('#addCollectionConfig', () => {
		const client = new Client();
		let chaincode;

		beforeEach(() => {
			chaincode = new Chaincode('mychaincode', 'v1', client);
		});

		it('should require a config', () => {
			(() => {
				chaincode.addCollectionConfig();
			}).should.throw('A JSON config parameter is required');
		});

		it('should require a valid config', () => {
			(() => {
				chaincode.setCollectionConfig({});
			}).should.throw('Expect collections config of type Array');
		});

		it('should set the collection config using an object', () => {
			chaincode.setCollectionConfig(COLLECTION_CONFIG);
			chaincode._collection_config_json.should.equal(COLLECTION_CONFIG);
		});
	});

	describe('#package', () => {
		const client = new Client();
		let chaincode;

		beforeEach(() => {
			chaincode = new Chaincode('mychaincode', 'v1', client);
		});

		it('should require a package request chaincodeType parameter', async () => {
			try {
				await chaincode.package({});
				should.fail();
			} catch (err) {
				err.message.should.equal('Chaincode package "chaincodeType" parameter is required');
			}
		});

		it('should require a good package request chaincodeType parameter', async () => {
			try {
				chaincode.setType('node');
				await chaincode.package();
				should.fail();
			} catch (err) {
				err.message.should.equal('Chaincode package "chaincodePath" parameter is required');
			}
		});

		it('should require a good package request chaincodeType parameter', async () => {
			try {
				await chaincode.package({chaincodeType: 'node'});
				should.fail();
			} catch (err) {
				err.message.should.equal('Chaincode package "chaincodePath" parameter is required');
			}
		});

		it('should require a good package request chaincodeType parameter', async () => {
			try {
				await chaincode.package({chaincodeType: 'bad'});
				should.fail();
			} catch (err) {
				err.message.should.equal('Chaincode type is not a known type bad');
			}
		});

		it('should require a good GOPATH environment with "golang" chaincodeType', async () => {
			process.env.GOPATH = path.join(__dirname, 'bad');

			try {
				await chaincode.package({
					chaincodeType: 'golang',
					chaincodePath: 'github.com/example_cc'
				});
				should.fail();
			} catch (err) {
				err.message.should.contains('ENOENT: no such file or directory');
			}
		});

		it('should require a good GOPATH environment with "golang" chaincodeType', async () => {
			process.env.GOPATH = path.join(__dirname, 'bad');

			try {
				chaincode.setChaincodePath('github.com/example_cc');
				await chaincode.package({
					chaincodeType: 'golang'
				});
				should.fail();
			} catch (err) {
				err.message.should.contains('ENOENT: no such file or directory');
			}
		});

		it('should require a GOPATH environment or "goPath" parameter with "golang" chaincodeType', async () => {
			delete process.env.GOPATH;

			try {
				await chaincode.package({
					chaincodeType: 'golang',
					chaincodePath: 'github.com/example_cc'
				});
				should.fail();
			} catch (err) {
				err.message.should.contains('Missing the GOPATH environment setting and the "goPath" parameter.');
			}
		});

		it('should require a good GOPATH environment setting and chaincodePath parameter with "golang" chaincodeType', async () => {
			process.env.GOPATH = path.join(__dirname, '../../test', 'fixtures/chaincode/golang');

			const packaged_chaincode = await chaincode.package({
				chaincodeType: 'golang',
				chaincodePath: 'github.com/example_cc'
			});
			expect(packaged_chaincode).to.have.property('length', 2111);
		});

		it('should require a good "goPath" parameter and chaincodePath parameter with "golang" chaincodeType', async () => {
			delete process.env.GOPATH;
			const goPath = path.join(__dirname, '../../test', 'fixtures/chaincode/golang');

			const packaged_chaincode = await chaincode.package({
				chaincodeType: 'golang',
				chaincodePath: 'github.com/example_cc',
				goPath: goPath
			});
			expect(packaged_chaincode).to.have.property('length', 2111);
		});

		it('should require a good "goPath" object setting with "golang" chaincodeType', async () => {
			delete process.env.GOPATH;
			const goPath = path.join(__dirname, '../../test', 'fixtures/chaincode/golang');
			chaincode.setGoLangPath(goPath);

			const packaged_chaincode = await chaincode.package({
				chaincodeType: 'golang',
				chaincodePath: 'github.com/example_cc'
			});
			expect(packaged_chaincode).to.have.property('length', 2111);
		});

		it('should require a good chaincodePath parameter with "node" chaincodeType', async () => {
			const node_path = path.join(__dirname, '../../test', 'fixtures/chaincode/node_cc/example_cc');

			const packaged_chaincode = await chaincode.package({
				chaincodeType: 'node',
				chaincodePath: node_path
			});
			expect(packaged_chaincode).to.have.property('length', 2571);
		});

		it('should require a good chaincodePath parameter with "java" chaincodeType', async () => {
			const java_path = path.join(__dirname, '../../test', 'fixtures/chaincode/java_cc/example_cc');

			const packaged_chaincode = await chaincode.package({
				chaincodeType: 'java',
				chaincodePath: java_path
			});
			expect(packaged_chaincode).to.have.property('length', 2241);
		});

		it('should require a good GOPATH environment setting and chaincodePath and metadataPath parameters with "golang" chaincodeType', async () => {
			process.env.GOPATH = path.join(__dirname, '../../test', 'fixtures/chaincode/goLang');
			const metadataPath = path.join(__dirname, '../../test', 'fixtures/chaincode/metadata');

			const packaged_chaincode = await chaincode.package({
				chaincodeType: 'golang',
				chaincodePath: 'github.com/example_cc',
				metadataPath: metadataPath
			});
			expect(packaged_chaincode).to.have.property('length', 2223);
			expect(chaincode.getPackage()).to.have.property('length', 2223);

		});

		it('should require a good chaincodePath and metadataPath parameters with "node" chaincodeType', async () => {
			const node_path = path.join(__dirname, '../../test', 'fixtures/chaincode/node_cc/example_cc');
			const metadataPath = path.join(__dirname, '../../test', 'fixtures/chaincode/metadata');

			const packaged_chaincode = await chaincode.package({
				chaincodeType: 'node',
				chaincodePath: node_path,
				metadataPath: metadataPath
			});
			expect(packaged_chaincode).to.have.property('length', 2678);
			expect(chaincode.getPackage()).to.have.property('length', 2678);
		});


		it('should require a good chaincodePath and metadataPath parameters with "java" chaincodeType', async () => {
			const java_path = path.join(__dirname, '../../test', 'fixtures/chaincode/java_cc/example_cc');
			const metadataPath = path.join(__dirname, '../../test', 'fixtures/chaincode/metadata');

			const packaged_chaincode = await chaincode.package({
				chaincodeType: 'java',
				chaincodePath: java_path,
				metadataPath: metadataPath
			});
			expect(packaged_chaincode).to.have.property('length', 2360);
			expect(chaincode.getPackage()).to.have.property('length', 2360);
			expect(chaincode._package).to.have.property('length', 2360);
		});

	});

	describe('#install', () => {
		const client = sinon.createStubInstance(Client);
		client._getSigningIdentity.returns('something');
		const FakeUtils = {
			buildSignedProposal: () => {
				return 'something';
			},
			sendPeersProposal: () => {
				return [{response: {status: 200}}];
			},
			_getSigningIdentity: () => {
				return {};
			}
		};
		const fake_getHashFromResponse = () => {
			return Buffer.from('hash');
		};
		Chaincode.__set__('client_utils', FakeUtils);
		let chaincode;
		const fake_txid = {
			isAdmin : () => {
				return true;
			}
		};

		beforeEach(() => {
			chaincode = new Chaincode('mychaincode', 'v1', client);
			chaincode._getHashFromResponse = fake_getHashFromResponse;
		});

		it('should require a ChaincodeInstallRequest parameter', async () => {
			try {
				await chaincode.install();
				should.fail();
			} catch (err) {
				err.message.should.equal('Install operation requires a ChaincodeInstallRequest object parameter');
			}
		});

		it('should require target parameter', async () => {
			try {
				chaincode.setPackage(Buffer.from('ABC'));
				await chaincode.install({});
				should.fail();
			} catch (err) {
				err.message.should.equal('Chaincode install "target" parameter is required');
			}
		});

		it('should require a package be assigned to this chaincode instance', async () => {
			try {
				await chaincode.install({target: 'target'});
				should.fail();
			} catch (err) {
				err.message.should.equal('Install operation requires a chaincode package be assigned to this chaincode');
			}
		});

		it('should be able to run without error with correct input', async () => {
			try {
				chaincode.setPackage(Buffer.from('ABC'));
				await chaincode.install({target: 'target', txId: fake_txid});
			} catch (err) {
				should.fail(err.toString());
			}
		});

		it('should be able to run without error with correct input and gen fake transactionID', async () => {
			const FakeTransactionID = sinon.stub();
			Chaincode.__set__('TransactionID', FakeTransactionID);

			try {
				chaincode.setPackage(Buffer.from('ABC'));
				await chaincode.install({target: 'target'});
			} catch (err) {
				should.fail(err.toString());
			}
		});

		it('should get an error to test final catch', async () => {
			FakeUtils.sendPeersProposal = () => {
				throw new Error('FAKE ERROR');
			};
			try {
				chaincode.setPackage(Buffer.from('ABC'));
				await chaincode.install({target: 'target', txId: fake_txid});
			} catch (err) {
				err.message.should.equal('FAKE ERROR');
			}
		});
	});
});
