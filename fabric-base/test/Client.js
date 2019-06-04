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
const expect = chai.expect;
chai.use(chaiAsPromised);
chai.use(sinonChai);
const sinon = require('sinon');

const Client = rewire('../lib/Client');
const FabricBase = require('..');
const {CryptoSuite, Key, Signer, SigningIdentity, Utils, User} = require('fabric-common');


const certificateAsPEM = fs.readFileSync(path.join(__dirname, '../../fabric-common/test/data', 'cert.pem'));
const certificateAsBuffer = Buffer.from(certificateAsPEM);
const certificateAsHex = certificateAsBuffer.toString('hex');

describe('Client', () => {
	Utils.setConfigSetting('crypto-suite-software', {
		'EC': 'fabric-common/lib/impl/CryptoSuite_ECDSA_AES.js'
	});
	Utils.setConfigSetting('crypto-keysize', 256);
	Utils.setConfigSetting('crypto-hash-algo', 'SHA2');
	let client;
	const tls_mutual = {};
	tls_mutual.clientCert = null;
	tls_mutual.clientKey = null;
	tls_mutual.clientCertHash = null;
	tls_mutual.selfGenerated = false;

	const mockPublicKey = sinon.createStubInstance(Key);
	const mockCryptoSuite = sinon.createStubInstance(CryptoSuite);
	const mockSigner = sinon.createStubInstance(Signer);
	const signingIdentity = new SigningIdentity(certificateAsHex, mockPublicKey, 'org1', mockCryptoSuite, mockSigner);
	const user = new User('admin');
	user.setSigningIdentity(signingIdentity);
	user._mspId = 'org1';

	beforeEach(() => {
		client = new Client('myclient');
	});

	describe('#required', () => {
		it('should require a name', () => {
			(() => {
				new FabricBase();
			}).should.throw('Missing name parameter');
		});

		it('should be able to create a client context with a name parameter', () => {
			const fclient = new FabricBase('myclient');
			expect(fclient._tls_mutual).to.deep.equal(tls_mutual);
		});
	});

	describe('#constructor', () => {
		it('should require a name', () => {
			(() => {
				new Client();
			}).should.throw('Missing name parameter');
		});

		it('should be able to create a client context with a name parameter', () => {
			client.name.should.equal('myclient');

		});
	});

	describe('#newTransactionContext', () => {
		it('should require a user', () => {
			(() => {
				client.newTransactionContext();
			}).should.throw('Missing user parameter');
		});

		it('should be able to create a transaction context with a user parameter', () => {
			const txContext = client.newTransactionContext(user);
			should.equal(txContext.user.getName(), 'admin');
		});
	});

	describe('#getChaincode', () => {
		it('should require a name', () => {
			(() => {
				client.getChaincode();
			}).should.throw('Missing name parameter');
		});

		it('should require a version', () => {
			(() => {
				client.getChaincode('mychaincode');
			}).should.throw('Missing version parameter');
		});

		it('should be able to create a chaincode with a name parameter', () => {
			const chaincode = client.getChaincode('mychaincode', 'v1');
			chaincode.name.should.equal('mychaincode');
			chaincode.version.should.equal('v1');
			should.equal(chaincode.client.name, 'myclient');
			should.equal(client.chaincodes.size, 1);
		});
	});

	describe('#newChaincode', () => {
		it('should require a name', () => {
			(() => {
				client.newChaincode();
			}).should.throw('Missing name parameter');
		});

		it('should require a version', () => {
			(() => {
				client.newChaincode('mychaincode');
			}).should.throw('Missing version parameter');
		});

		it('should be able to create a chaincode with a name parameter', () => {
			const chaincode = client.newChaincode('mychaincode', 'v1');
			chaincode.name.should.equal('mychaincode');
			chaincode.version.should.equal('v1');
			should.equal(chaincode.client.name, 'myclient');
			should.equal(client.chaincodes.size, 1);
		});
	});

	describe('#getPeer', () => {
		it('should require a name', () => {
			(() => {
				client.getPeer();
			}).should.throw('Missing name parameter');
		});

		it('should be able to create a Peer with a name parameter', () => {
			const peer = client.getPeer('mypeer');
			peer.name.should.equal('mypeer');
			should.equal(peer.client.name, 'myclient');
			should.equal(client.peers.size, 1);
		});
	});

	describe('#getOrderer', () => {
		it('should require a name', () => {
			(() => {
				client.getOrderer();
			}).should.throw('Missing name parameter');
		});

		it('should be able to create a Orderer with a name parameter', () => {
			const orderer = client.getOrderer('myorderer');
			orderer.name.should.equal('myorderer');
			should.equal(orderer.client.name, 'myclient');
			should.equal(client.orderers.size, 1);
		});
	});

	describe('#getChannel', () => {
		it('should require a name', () => {
			(() => {
				client.getChannel();
			}).should.throw('Missing name parameter');
		});

		it('should be able to create a channel with a name parameter', () => {
			const channel = client.getChannel('mychannel');
			channel.name.should.equal('mychannel');
			should.equal(channel.client.name, 'myclient');
			should.equal(client.channels.size, 1);
		});
	});

	describe('#setTlsClientCertAndKey', () => {
		it('should be able to set the client key and cert', () => {
			client.setTlsClientCertAndKey(certificateAsPEM, certificateAsHex);
			should.equal(client._tls_mutual.clientCert, certificateAsPEM);
			should.equal(client._tls_mutual.clientKey, certificateAsHex);
			should.equal(client._tls_mutual.selfGenerated, false);
		});
		it('should be able to set the self signed client key and cert', () => {
			client.setTlsClientCertAndKey();
			should.equal(client._tls_mutual.selfGenerated, true);
		});
	});

	describe('#addTlsClientCertAndKey', () => {
		it('should be able to not put the client info into a options list', () => {
			const options = {someprop: 'hello'};
			client.addTlsClientCertAndKey(options);
			should.equal(options.clientCert, undefined);
			should.equal(options.clientKey, undefined);
		});
		it('should be able to put the client info into a options list', () => {
			client.setTlsClientCertAndKey(certificateAsPEM, certificateAsHex);
			const options = {someprop: 'hello'};
			client.addTlsClientCertAndKey(options);
			should.equal(options.clientCert, certificateAsPEM);
			should.equal(options.clientKey, certificateAsHex);
		});
	});

	describe('#getClientCertHash', () => {
		it('should be able to get the client cert hash', () => {
			client.setTlsClientCertAndKey(certificateAsPEM, certificateAsHex);
			const hash = client.getClientCertHash();
			should.equal(client._tls_mutual.clientCertHash, hash);
			const hash2 = client.getClientCertHash();
			should.equal(hash2, hash);
		});
	});

	describe('#getClientCertHash - self signed', () => {
		it('should be able to get the client cert hash for the self signed', () => {
			const hash = client.getClientCertHash(true);
			should.equal(client._tls_mutual.clientCertHash, hash);
		});
	});
});
