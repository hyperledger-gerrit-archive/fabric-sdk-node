/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const rewire = require('rewire');
const Utils = rewire('../../fabric-common/lib/Utils');


// eslint-disable-next-line no-unused-vars
const should = require('chai').should();
const sinon = require('sinon');

describe('Utils', () => {
	let revert;
	let sandbox;

	let requireStub;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		revert = [];
		requireStub = sandbox.stub();
	});

	afterEach(() => {
		if (revert.length) {
			revert.forEach(Function.prototype.call, Function.prototype.call);
		}
		sandbox.restore();
	});

	describe('#newCryptoSuite', () => {
		it('should return cryptoSuite instance when given all parameters', () => {
			const settings = {
				software: false,
				keysize: 1,
				algorithm: 'sha',
				hash: 'hash'
			};
			const MockCryptoSuite = sinon.stub();
			const getConfigSettingStub = sandbox.stub();
			getConfigSettingStub.onCall(0).returns({'SHA': 'sha file'});

			requireStub.returns(MockCryptoSuite);
			revert.push(Utils.__set__('getConfigSetting', getConfigSettingStub));
			revert.push(Utils.__set__('require', requireStub));
			Utils.newCryptoSuite(settings).should.deep.equal({});
			sinon.assert.calledWith(requireStub, 'sha file');

			sinon.assert.calledWith(MockCryptoSuite, 1, 'HASH', settings);
		});

		it('should return cryptoSuite instance when parameters missing', () => {
			const settings = {};
			const MockCryptoSuite = sinon.stub();
			const getConfigSettingStub = sandbox.stub();
			getConfigSettingStub.withArgs('crypto-hsm').returns(false);
			getConfigSettingStub.withArgs('crypto-suite-software').returns({'EC': 'ec file'});
			getConfigSettingStub.withArgs('crypto-keysize').returns(10);

			requireStub.returns(MockCryptoSuite);
			revert.push(Utils.__set__('getConfigSetting', getConfigSettingStub));
			revert.push(Utils.__set__('require', requireStub));
			Utils.newCryptoSuite(settings).should.deep.equal({});
			sinon.assert.calledWith(requireStub, 'ec file');

			sinon.assert.calledWith(MockCryptoSuite, 10, null, settings);
		});

		it('should throw an error if csImpl does not exist', () => {
			const settings = {};
			const getConfigSettingStub = sandbox.stub();
			getConfigSettingStub.withArgs('crypto-hsm').returns(true);
			getConfigSettingStub.withArgs('crypto-suite-hsm').returns({});
			getConfigSettingStub.withArgs('crypto-keysize').returns(10);
			revert.push(Utils.__set__('getConfigSetting', getConfigSettingStub));

			(() => {
				Utils.newCryptoSuite(settings);
			}).should.throw(/Desired CryptoSuite module not found supporting algorithm/);
		});

		it('should return cryptoSuite instance when no settings given', () => {
			const MockCryptoSuite = sinon.stub();
			const getConfigSettingStub = sandbox.stub();
			getConfigSettingStub.withArgs('crypto-hsm').returns(false);
			getConfigSettingStub.withArgs('crypto-suite-software').returns({'EC': 'ec file'});
			getConfigSettingStub.withArgs('crypto-keysize').returns(10);

			requireStub.returns(MockCryptoSuite);
			revert.push(Utils.__set__('getConfigSetting', getConfigSettingStub));
			revert.push(Utils.__set__('require', requireStub));
			Utils.newCryptoSuite().should.deep.equal({});
			sinon.assert.calledWith(requireStub, 'ec file');

			sinon.assert.calledWith(MockCryptoSuite, 10, null, null);
		});
	});

	describe('#newKeyValueStore', () => {
		it('should create a new key value store', async () => {
			const MockKeyValStore = sandbox.stub().returns(new Object({'value': 1, initialize: sinon.stub().resolves}));
			requireStub = sandbox.stub().returns(MockKeyValStore);
			const getConfigSettingStub = sandbox.stub().returns('kvs');
			revert.push(Utils.__set__('getConfigSetting', getConfigSettingStub));
			revert.push(Utils.__set__('require', requireStub));

			const kvs = await Utils.newKeyValueStore('options');
			sinon.assert.calledWith(requireStub, 'kvs');
			sinon.assert.calledWith(MockKeyValStore, 'options');
			kvs.value.should.equal(1);
		});
	});

	describe('#addConfigFile', () => {
		it('should call exports.getConfig and config.file', () => {
			const fileStub = sandbox.stub();
			const configStub = sandbox.stub().returns({file: fileStub});
			revert.push(Utils.__set__('exports.getConfig', configStub));
			Utils.addConfigFile('path');
			sinon.assert.calledOnce(configStub);
			sinon.assert.calledWith(fileStub, 'path');
		});
	});

	describe('#setConfigSetting', () => {
		it('should call exports.getConfig and config.set', () => {
			const setStub = sandbox.stub();
			const configStub = sandbox.stub().returns({set: setStub});
			revert.push(Utils.__set__('exports.getConfig', configStub));
			Utils.setConfigSetting('name', 'value');
			sinon.assert.calledOnce(configStub);
			sinon.assert.calledWith(setStub, 'name', 'value');
		});
	});

	describe('#getConfigSetting', () => {
		it('should call exports.getConfig and config.get', () => {
			const getStub = sandbox.stub();
			const configStub = sandbox.stub().returns({get: getStub});
			revert.push(Utils.__set__('exports.getConfig', configStub));
			Utils.getConfigSetting('name', 'default_value');
			sinon.assert.calledOnce(configStub);
			sinon.assert.calledWith(getStub, 'name', 'default_value');
		});
	});

	describe('#getConfig', () => {
		let getConfig;
		let MockConfig;

		beforeEach(() => {
			getConfig = Utils.__get__('exports.getConfig');
			MockConfig = class {
			};
			revert.push(Utils.__set__('Config', MockConfig));
		});

		it('should return the global hfc config', () => {
			const globalHfcStub = {config: 'global-config'};
			revert.push(Utils.__set__('global.hfc', globalHfcStub));
			const config = getConfig();
			config.should.equal('global-config');
		});

		it('should create new config instance and add it to the global hfc', () => {
			const globalHfcStub = {config: null};
			revert.push(Utils.__set__('global.hfc', globalHfcStub));
			const config = getConfig();
			config.should.be.instanceOf(MockConfig);
			globalHfcStub.should.deep.equal({config: config});
		});

		it('should create new config instance and create new global hfc', () => {
			const globalHfcStub = null;
			revert.push(Utils.__set__('global.hfc', globalHfcStub));
			const config = getConfig();
			config.should.be.instanceOf(MockConfig);
			const globalHfc = Utils.__get__('global.hfc');
			globalHfc.should.deep.equal({config: config});
		});
	});

	describe('#bitsToBytes', () => {
		it('should return the correct value', () => {
			const result = Utils.bitsToBytes([1, 1, 1, 1]);
			result.should.deep.equal([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
		});
	});

	describe('#bytesToBits', () => {
		it('should return the correct value', () => {
			const result = Utils.bytesToBits([1, 1, 1, 1]);
			result.should.deep.equal([16843009]);
		});

		it('should return the correct value', () => {
			const result = Utils.bytesToBits([1, 1, 1]);
			result.should.deep.equal([26388295909632]);
		});
	});

	describe('#zeroBuffer', () => {
		it('should return a buffer of length 10', () => {
			const result = Utils.zeroBuffer(10);
			result.length.should.equal(10);
		});
	});

	describe('#toArrayBuffer', () => {
		it('should retun a buffer containing array items', () => {
			const expectedValues = [1, 2, 3, 4];
			const result = Utils.toArrayBuffer(expectedValues);
			const view = new Uint8Array(result);
			result.byteLength.should.equal(4);
			view.forEach((val, i) => {
				val.should.equal(expectedValues[i]);
			});
		});

		it('should retun an empty ArrayBuffer', () => {
			const expectedValues = [];
			const result = Utils.toArrayBuffer(expectedValues);
			result.byteLength.should.equal(0);
			result.should.be.instanceof(ArrayBuffer);
		});
	});

	describe('#getNonce', () => {
		let cryptoStub;
		let cryptoRandomBytesStub;

		beforeEach(() => {
			cryptoRandomBytesStub = sandbox.stub();
			cryptoStub = {randomBytes: cryptoRandomBytesStub};
			revert.push(Utils.__set__('crypto', cryptoStub));
		});

		it('should throw an error if given a string', () => {
			(() => {
				Utils.getNonce('10');
			}).should.throw(/Parameter must be an integer/);
		});

		it('should throw an error if given an object', () => {
			(() => {
				Utils.getNonce({});
			}).should.throw(/Parameter must be an integer/);
		});

		it('should return the result of crypto.randomBytes', () => {
			cryptoRandomBytesStub.returns(10);
			const result = Utils.getNonce(10);
			sinon.assert.calledWith(cryptoRandomBytesStub, 10);
			result.should.equal(10);
		});

		it('should return the result of crypto.randomBytes and call getConfigSetting', () => {
			const getConfigSettingStub = sandbox.stub().returns(20);
			revert.push(Utils.__set__('getConfigSetting', getConfigSettingStub));
			cryptoRandomBytesStub.returns(20);
			const result = Utils.getNonce();
			sinon.assert.calledWith(getConfigSettingStub, 'nonce-size', 24);
			sinon.assert.calledWith(cryptoRandomBytesStub, 20);
			result.should.equal(20);
		});
	});

	describe('#getClassMethods', () => {
		it('should return the class methods for an instance', () => {
			const MockClass = class {
				constructor() {
				}

				method1() {
				}

				method2() {
				}

				static staticFn() {
				}
			};
			const classMethods = Utils.getClassMethods(MockClass);
			classMethods.length.should.equal(2);
			classMethods.should.deep.equal(['method1', 'method2']);
		});
	});

	describe('#getBufferBit', () => {
		it('should return error=true if bit to mask exceeds buffer length', () => {
			const result = Utils.getBufferBit(new Buffer(1), 8);
			result.error.should.be.true;
			result.invalid.should.equal(0);
		});

		it('should return error=false invalid=1', () => {
			const result = Utils.getBufferBit(Buffer.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 0);
			result.error.should.be.false;
			result.invalid.should.equal(1);
		});

		it('should return error=false invalid=0', () => {
			const result = Utils.getBufferBit(new Buffer(10), 0);
			result.error.should.be.false;
			result.invalid.should.equal(0);
		});
	});

	describe('#getDefaultKeyStorePath', () => {
		it('should return the default key store path', () => {
			const homedirStub = sandbox.stub().returns('homepath');
			revert.push(Utils.__set__('os.homedir', homedirStub));
			const joinStub = sandbox.stub().returns('path');
			revert.push(Utils.__set__('path.join', joinStub));
			const result = Utils.getDefaultKeyStorePath();
			sinon.assert.calledWith(joinStub, 'homepath');
			sinon.assert.called(homedirStub);
			result.should.equal('path');
		});
	});

	describe('#newCryptoKeyStore', () => {
		let getConfigSettingStub;

		beforeEach(() => {
			getConfigSettingStub = sandbox.stub().returns('crypto-key-store');
			revert.push(Utils.__set__('getConfigSetting', getConfigSettingStub));
		});

		afterEach(() => {
			sinon.assert.calledWith(requireStub, 'crypto-key-store');
		});
		it('should create a new instance of CryptoKeyStore with given KVSImplClass and opts', () => {
			const MockKeyStore = class {
				constructor(opts, KVSImplClass) {
					opts.should.equal('opts');
					KVSImplClass.should.equal('KVSImplClass');
				}
			};
			const MockCryptoKeyStore = sandbox.stub().returns(new MockKeyStore('opts', 'KVSImplClass'));
			requireStub = sandbox.stub().returns(MockCryptoKeyStore);
			revert.push(Utils.__set__('require', requireStub));

			const keyStore = Utils.newCryptoKeyStore('opts', 'KVSImplClass');
			// sinon.assert.calledWith(MockCryptoKeyStore, Utils.getDefaultKeyStorePath(), {});
			keyStore.should.be.instanceof(MockKeyStore);
		});
		it('should create a new instance of CryptoKeyStore with given KVSImplClass', () => {
			const MockKeyStore = class {
				constructor(KVSImplClass) {
					KVSImplClass.should.equal('KVSImplClass');
				}
			};
			const MockCryptoKeyStore = sandbox.stub().returns(new MockKeyStore('KVSImplClass'));
			requireStub = sandbox.stub().returns(MockCryptoKeyStore);
			revert.push(Utils.__set__('require', requireStub));

			const keyStore = Utils.newCryptoKeyStore('KVSImplClass');
			// sinon.assert.calledWith(MockCryptoKeyStore, {});
			keyStore.should.be.instanceof(MockKeyStore);
		});
		it('should create a new instance of CryptoKeyStore with given opts', () => {
			const MockKeyStore = class {
				constructor(opts) {
					opts.should.equal('opts');
				}
			};
			const MockCryptoKeyStore = sandbox.stub().returns(new MockKeyStore('opts'));
			requireStub = sandbox.stub().returns(MockCryptoKeyStore);
			revert.push(Utils.__set__('require', requireStub));

			const keyStore = Utils.newCryptoKeyStore('opts');
			sinon.assert.calledWith(MockCryptoKeyStore, 'opts');
			keyStore.should.be.instanceof(MockKeyStore);
		});

		it('should create a new instance of CryptoKeyStore with non given arguments', () => {
			const MockKeyStore = class {
			};
			const MockCryptoKeyStore = sandbox.stub().returns(new MockKeyStore());
			requireStub = sandbox.stub().returns(MockCryptoKeyStore);
			revert.push(Utils.__set__('require', requireStub));

			const keyStore = Utils.newCryptoKeyStore();
			sinon.assert.calledWith(MockCryptoKeyStore);
			keyStore.should.be.instanceof(MockKeyStore);
		});
	});

	describe('#checkAndAddConfigSetting', () => {
		let getConfigSettingStub;

		beforeEach(() => {
			getConfigSettingStub = sandbox.stub();
			revert.push(Utils.__set__('getConfigSetting', getConfigSettingStub));
		});

		it('should reutrn a list of return options', () => {
			getConfigSettingStub.returns('config_option_name');
			const result = Utils.checkAndAddConfigSetting('option_name', 'default_value', {key1: 'value1'});
			result.should.deep.equal({option_name: 'config_option_name', key1: 'value1'});
		});

		it('should return the default value when no options passed in', () => {
			getConfigSettingStub.returns('config_option_name');
			const result = Utils.checkAndAddConfigSetting('option_name', 'default_value');
			result.should.deep.equal({option_name: 'config_option_name'});
		});
	});

	describe('#normalizeX509', () => {
		it('should throw an error if string doesnt match pattern', () => {
			(() => {
				Utils.normalizeX509('');
			}).should.throw(/Failed to find start line or end line of the certificate./);
		});

		it('should match with a valid certificate', () => {
			const result = Utils.normalizeX509(`-----BEGIN CERTIFICATE-----
			sadfasdfasdfasdfas
			-----END CERTIFICATE-----`);
			result.should.equal('-----BEGIN CERTIFICATE-----\nsadfasdfasdfasdfas\n-----END CERTIFICATE-----\n');
		});
	});

	describe('#pemToDER', () => {
		it('should throw an error if a pem does not match', () => {
			(() => {
				Utils.pemToDER(`-----BEGIN CERTIFICATE-----
			sadfasdfasdfasdfas
			-----ERROR-----`);
			}).should.throw(/Input parameter does not appear to be PEM-encoded./);
		});

		it('should encode a valid certificate', () => {
			const result = Utils.pemToDER(`-----BEGIN CERTIFICATE-----
			sadfasdfasdfasdfas
			-----END CERTIFICATE-----`);
			result.toString('hex').should.equal('b1a75f6ac75f6ac75f6ac75f6a');
		});
	});


	describe('#checkIntegerConfig', () => {
		it('should throw an error if config value is not an integer', () => {
			const opts = {
				'key1': 'value1'
			};
			(() => {
				Utils.checkIntegerConfig(opts, 'key1');
			}).should.throw(/Expect an integer value of key1, found string/);
		});

		it('should return true if the value is valid', () => {
			const opts = {
				'key1': 1
			};
			const result = Utils.checkIntegerConfig(opts, 'key1');
			result.should.be.true;
		});

		it('should return false if the config value is not found in opts', () => {
			const opts = {
				'key1': 1
			};
			const result = Utils.checkIntegerConfig(opts, 'key2');
			result.should.be.false;
		});
	});
});
