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

const fabprotos = require('fabric-protos');
const Client = require('../lib/Client');
const ChannelEventHub = rewire('../lib/ChannelEventHub');
const {CryptoSuite, Key, Signer, SigningIdentity, Utils, User} = require('fabric-common');

const certificateAsPEM = fs.readFileSync(path.join(__dirname, '../../fabric-common/test/data', 'cert.pem'));
const certificateAsBuffer = Buffer.from(certificateAsPEM);
const certificateAsHex = certificateAsBuffer.toString('hex');

describe('ChannelEventHub', () => {
	Utils.setConfigSetting('crypto-suite-software', {
		"EC": "fabric-common/lib/impl/CryptoSuite_ECDSA_AES.js"
	});
	Utils.setConfigSetting('crypto-keysize', 256);
	Utils.setConfigSetting('crypto-hash-algo', 'SHA2');
	const tls_mutual = {};
	tls_mutual.clientCert = null;
	tls_mutual.clientKey = null;
	tls_mutual.clientCertHash = null;
	tls_mutual.selfGenerated = false;

	const mockPublicKey = sinon.createStubInstance(Key);
	const mockCryptoSuite = sinon.createStubInstance(CryptoSuite);
	const mockSigner = sinon.createStubInstance(Signer);
	const signingIdentity = new SigningIdentity(certificateAsHex, mockPublicKey, 'org1', mockCryptoSuite, mockSigner);
	user = new User('admin');
	user.setSigningIdentity(signingIdentity);
	user._mspId = 'org1';

	let client;
	let txContext;
	let channel;
	let peer;
	let hub;
	let sandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();

		client = new Client('myclient');
		client.clientCertHash = Buffer.from('hash');
		txContext = client.newTransactionContext(user);
		channel = client.newChannel('mychannel');
		channel.buildChannelHeader = () => {
			return new fabprotos.common.ChannelHeader();
		}
		peer = client.newPeer('peer1');
		hub = channel.newChannelEventHub('myhub', peer);
	});

	describe('#constructor', () => {
		it('should require a name', () => {
			(() => {
				new ChannelEventHub();
			}).should.throw('Missing name parameter');
		});

		it('should require a channel', () => {
			(() => {
				new ChannelEventHub('myhub');
			}).should.throw('Missing channel parameter');
		});

		it('should require a peer', () => {
			(() => {
				new ChannelEventHub('myhub', channel);
			}).should.throw('Missing peer parameter');
		});

		it('should be able to create a channel event hub', () => {
			const hub = new ChannelEventHub('myhub', channel, peer);
			hub.name.should.equal('myhub');
		});
	});	

	describe('#connect', () => {
		it('should get the correct options', () => {
			const fakeStub = sandbox.stub().returns('done');
			hub.waitForReady = fakeStub;
			hub.connect();
			hub.connect({test:'test'});
			hub.options.test.should.equal('test');
			return;
		});
	});

	describe('#buildStartRequest', () => {
		it('should require a txContext', () => {
			(() => {
				hub.buildStartRequest();
			}).should.throw('Missing txContext parameter');
		});

		it('should get the correct defaults', () => {
			hub.buildStartRequest(txContext);
			hub.filtered.should.equal(true);
			hub.start_block.should.equal('newest');
			hub.end_block_seen.should.equal(false);
		});
		it('should get the correct settings', () => {
			hub.buildStartRequest(txContext, {filtered: false, startBlock: 'oldest', endBlock: 4});
			hub.filtered.should.equal(false);
			hub.start_block.should.equal('oldest');
			hub.end_block.should.equal(4);
			hub.end_block_seen.should.equal(false);
		});
	});

	describe('#setStartRequestSignature', () => {
		it('should require a signature', () => {
			(() => {
				hub.setStartRequestSignature();
			}).should.throw('Missing signature parameter');
		});
	});

	describe('#signStartRequest', () => {
		it('should require a txContext', () => {
			(() => {
				hub.signStartRequest();
			}).should.throw('Missing txContext parameter');
		});
		it('should require a payload_bytes', () => {
			(() => {
				hub.signStartRequest({});
			}).should.throw('Missing payload_bytes parameter');
		});
	});
	
	describe('#buildAndSignStartRequest', () => {
		it('should require a txContext', () => {
			(() => {
				hub.signStartRequest();
			}).should.throw('Missing txContext parameter');
		});
	});

	describe('#getSignedStartRequestEnvelope', () => {
		it('should require a payload', () => {
			(() => {
				hub.getSignedStartRequestEnvelope();
			}).should.throw('Missing payload - build the start request');
		});
		it('should require a signature', () => {
			(() => {
				hub.seekPayloadBytes = 'payload';
				hub.getSignedStartRequestEnvelope();
			}).should.throw('Missing signature - sign the start request');
		});
		it('should get the correct envelope', () => {
			hub.seekPayloadBytes = 'payload';
			hub.signature = 'signature';
			const envelope = hub.getSignedStartRequestEnvelope();
			expect(envelope.signature).to.equal('signature');
			expect(envelope.payload).to.equal('payload');
		});
	});
});
