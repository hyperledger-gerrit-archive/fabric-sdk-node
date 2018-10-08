/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const sinon = require('sinon');
const chai = require('chai');
chai.use(require('chai-as-promised'));
const rewire = require('rewire');

const CouchDBWallet = rewire('../../../lib/impl/wallet/couchdbwallet');
const X509WalletMixin = require('../../../lib/impl/wallet/x509walletmixin');

describe('CouchDBWallet', () => {
	let testwallet;
	let sandbox;
	let nanoStub;
	let getStub;
	let listStub;
	let destroyStub;
	const CouchDBKeyValueStoreMock = class {};
	let FakeLogger;
	let ClientStub;
	let newCryptoSuiteStub;
	let setCryptoSuiteStub;
	let setCryptoKeyStoreStub;
	let newCryptoKeyStoreStub;
	const PREFIX = 'PREFIX';
	CouchDBWallet.__set__('PREFIX', PREFIX);

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		FakeLogger = {
			error: () => {},
			debug: () => {}
		};
		sandbox.stub(FakeLogger);
		CouchDBWallet.__set__('logger', FakeLogger);
		CouchDBWallet.__set__('CouchDBVStore', CouchDBKeyValueStoreMock);
		nanoStub = sandbox.stub();

		listStub = sandbox.stub();
		getStub = sandbox.stub();
		destroyStub = sandbox.stub();
		nanoStub.returns({db: {
			destroy: destroyStub,
			get: getStub,
			list: listStub
		}});
		CouchDBWallet.__set__('Nano', nanoStub);
		testwallet = new CouchDBWallet({url: 'http://someurl'});
		newCryptoKeyStoreStub = sandbox.stub();
		setCryptoKeyStoreStub = sandbox.stub();
		setCryptoSuiteStub = sandbox.stub();
		newCryptoSuiteStub = sandbox.stub().returns({setCryptoKeyStore: setCryptoKeyStoreStub});
		ClientStub = {
			newCryptoSuite: newCryptoSuiteStub,
			setCryptoSuite: setCryptoSuiteStub,
			newCryptoKeyStore: newCryptoKeyStoreStub
		};
		CouchDBWallet.__set__('Client', ClientStub);
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('#constructor', () => {
		it('should throw an error if path not defined', () => {
			(() => {new CouchDBWallet();}).should.throw(/No options/);
		});

		it('should throw an error if path not defined', () => {
			(() => {new CouchDBWallet({});}).should.throw(/No url/);
		});

		it('should default to X509 wallet mixin', () => {
			testwallet.walletMixin.should.be.an.instanceof(X509WalletMixin);
		});

		it('should accept a mixin parameter', () => {
			const wallet = new CouchDBWallet({url: 'http://someurl'},'my_mixin');
			sinon.assert.calledWith(FakeLogger.debug, 'in CouchDBWallet %s', 'constructor');
			wallet.walletMixin.should.equal('my_mixin');
		});

		it('should create a Nano object', () => {
			new CouchDBWallet({url: 'http://someurl'});
			sinon.assert.calledWith(nanoStub, 'http://someurl');
		});

		it('should set dbOptions', () => {
			const wallet = new CouchDBWallet({url: 'http://someurl'}, 'my_mixin');
			wallet.dbOptions.should.deep.equal({url: 'http://someurl'});
			wallet.options.should.deep.equal({url: 'http://someurl'});
		});
	});

	describe('#_createOptions', () => {
		it('should normalise the label and assign a prefix to the label', () => {
			const options = testwallet._createOptions('label');
			options.should.deep.equal({
				url: 'http://someurl',
				name: PREFIX + 'label'
			});
		});
	});

	describe('#getStateStore', () => {
		it('should create a KV store and log that it was created', async() => {
			const kvs = await testwallet.getStateStore('label');
			kvs.should.be.an.instanceof(CouchDBKeyValueStoreMock);
			sinon.assert.calledWith(FakeLogger.debug, 'in %s, label = %s', 'getStateStore', 'label');
		});
	});

	describe('#getCryptoSuite', () => {
		it('should set the cryptoSuite', async() => {
			newCryptoKeyStoreStub.returns('crypto-store');
			const cryptoSuite = await testwallet.getCryptoSuite('label');
			sinon.assert.calledWith(FakeLogger.debug, 'in %s, label = %s', 'getCryptoSuite', 'label');
			sinon.assert.called(newCryptoSuiteStub);
			sinon.assert.calledWith(setCryptoKeyStoreStub, 'crypto-store');
			sinon.assert.calledWith(newCryptoKeyStoreStub);
			cryptoSuite.should.deep.equal(newCryptoSuiteStub());
		});
	});

	describe('#delete', () => {
		it('should delete an identity from the wallet if it exists', async() => {
			destroyStub.yields();
			const deleted = await testwallet.delete('label');
			sinon.assert.calledWithMatch(destroyStub, 'label', Function);
			deleted.should.be.true;
		});

		it('should log and throw an error if identity does not exist', async() => {
			destroyStub.yields(new Error('Some error'));
			try {
				await testwallet.delete('label');
			} catch (err) {
				err.should.be.instanceof(Error);
			}
			sinon.assert.calledWithMatch(destroyStub, 'label', Function);
		});

		it('should resolve false if key is not found', async () => {
			const err = new Error();
			err.error = 'not_found';
			destroyStub.yields(err);
			const res = await testwallet.delete('label');
			res.should.be.false;
		});
	});

	describe('#exists', () => {
		it('should return true if identity exists', async () => {
			getStub.yields();
			const existance = await testwallet.exists('label');
			sinon.assert.calledWith(FakeLogger.debug, 'in %s, label = %s', 'exists', 'label');
			sinon.assert.calledWithMatch(getStub, 'label', Function);
			existance.should.equal(true);
		});

		it('should throw an error if identity does not exist', async() => {
			getStub.yields(new Error());
			try {
				await testwallet.exists('label');
			} catch (err) {
				err.should.be.instanceof(Error);
			}
			sinon.assert.calledWithMatch(getStub, 'label', Function);
			sinon.assert.calledWith(FakeLogger.debug, '%s - error trying to find %s', 'exists', 'label');
		});

		it('should resolve false if key is not found', async () => {
			const err = new Error();
			err.error = 'not_found';
			getStub.yields(err);
			const res = await testwallet.exists('label');
			res.should.be.false;
		});
	});

	describe('#getAllLabels', () => {
		it('should list all identities in the wallet', async() => {
			listStub.yields(null, [PREFIX + 'IDENTITY']);
			const identities = await testwallet.getAllLabels();
			identities.should.deep.equal(['IDENTITY']);
		});

		it('should throw an error if list throws', async() => {
			listStub.yields(new Error('an error'));
			try {
				await testwallet.getAllLabels();
			} catch (err) {
				err.should.be.instanceof(Error);
			}
			sinon.assert.calledWith(FakeLogger.debug, '%s - error trying to list', 'getAllLabels');
		});

		it('should resolve false if key is not found', async () => {
			const err = new Error();
			err.error = 'not_found';
			listStub.yields(err);
			const res = await testwallet.getAllLabels();
			res.should.be.false;
		});
	});
});
