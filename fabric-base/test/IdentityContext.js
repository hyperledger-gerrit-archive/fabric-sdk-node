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
const IdentityContext = rewire('../lib/IdentityContext');

const certificateAsPEM = fs.readFileSync(path.join(__dirname, '../../fabric-common/test/data', 'cert.pem'));
const certificateAsBuffer = Buffer.from(certificateAsPEM);
const certificateAsHex = certificateAsBuffer.toString('hex');
const mspId = 'Org1MSP';

describe('IdentityContext', () => {
	Utils.setConfigSetting('crypto-suite-software', {
		'EC': 'fabric-common/lib/impl/CryptoSuite_ECDSA_AES.js'
	});
	Utils.setConfigSetting('crypto-keysize', 256);
	Utils.setConfigSetting('crypto-hash-algo', 'SHA2');

	let user;
	let signingIdentity;
	let mockPublicKey;
	let mockCryptoSuite;
	let mockSigner;
	let idx;

	beforeEach(() => {
		mockPublicKey = sinon.createStubInstance(Key);
		mockCryptoSuite = sinon.createStubInstance(CryptoSuite);
		mockSigner = sinon.createStubInstance(Signer);
		signingIdentity = new SigningIdentity(certificateAsHex, mockPublicKey, mspId, mockCryptoSuite, mockSigner);
		user = new User('admin');
		user.setSigningIdentity(signingIdentity);
		user._mspId = mspId;
		idx = new IdentityContext(user);
	});

	describe('#constructor', () => {
		it('should throw if no user', () => {
			(() => {
				new IdentityContext();
			}).should.throw(/Missing user parameter/);
		});
		it('should throw if bad user', () => {
			(() => {
				new IdentityContext('bad');
			}).should.throw(/Invalid user instance/);
		});
		it('should have a user name by now', () => {
			should.equal(idx.user.getName(), 'admin');
		});
	});

	describe('#calculateTxId', () => {
		it('should be able to reset the txId and nonce', () => {
			const old_txId = idx.transactionId;
			const old_nonce = idx.nonce;
			idx.calculateTxId();
			should.not.equal(idx.transactionId, old_txId);
			should.not.equal(idx.nonce, old_nonce);
			should.equal(idx.transactionId.length, 64);
		});
	});

});
