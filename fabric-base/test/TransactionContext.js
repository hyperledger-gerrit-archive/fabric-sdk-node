/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const rewire = require('rewire');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinonChai = require('sinon-chai');
const should = chai.should();
chai.use(chaiAsPromised);
chai.use(sinonChai);
const sinon = require('sinon');

const {CryptoSuite, Key, Signer, SigningIdentity, Utils, User} = require('fabric-common');
const TransactionContext = rewire('../lib/TransactionContext');

const certificateAsPEM = fs.readFileSync(path.join(__dirname, '../../fabric-common/test/data', 'cert.pem'));
const certificateAsBuffer = Buffer.from(certificateAsPEM);
const certificateAsHex = certificateAsBuffer.toString('hex');
const mspId = 'Org1MSP';

describe('TransactionContext', () => {
	Utils.setConfigSetting('crypto-suite-software', {
		"EC": "fabric-common/lib/impl/CryptoSuite_ECDSA_AES.js"
	});
	Utils.setConfigSetting('crypto-keysize', 256);
	Utils.setConfigSetting('crypto-hash-algo', 'SHA2');
	
	let user;
	let signingIdentity;
	let mockPublicKey;
	let mockCryptoSuite;
	let mockSigner;
	let transactionContext;

	beforeEach(() => {
		mockPublicKey = sinon.createStubInstance(Key);
		mockCryptoSuite = sinon.createStubInstance(CryptoSuite);
		mockSigner = sinon.createStubInstance(Signer);
		signingIdentity = new SigningIdentity(certificateAsHex, mockPublicKey, mspId, mockCryptoSuite, mockSigner);
		user = new User('admin');
		user.setSigningIdentity(signingIdentity);
		user._mspId = mspId;
		transactionContext = new TransactionContext(user);
	});

	describe('#constructor', () => {
		it('should throw if no user', () => {
			(() => {
				new TransactionContext();
			}).should.throw(/Missing user parameter/);
		});
		it('should throw if bad user', () => {
			(() => {
				new TransactionContext('bad');
			}).should.throw(/Invalid user instance/);
		});
		it('should have a user name by now', () => {
			should.equal(transactionContext.user.getName(), 'admin');
		});
	});

	describe('#calculateTxId', () => {
		it('should be able to reset the txId and nonce', () => {
			const old_txId = transactionContext.txId;
			const old_nonce = transactionContext.nonce;
			transactionContext.calculateTxId();
			should.not.equal(transactionContext.txId, old_txId);
			should.not.equal(transactionContext.nonce, old_nonce);
			should.equal(transactionContext.txId.length, 64);
		});
	});

	describe('#addOption', () => {
		it('should be able to add an option', () => {
			transactionContext.addOption('op1', 'somevalue');
			should.equal(transactionContext.options.op1, 'somevalue');
		});
	});
});
