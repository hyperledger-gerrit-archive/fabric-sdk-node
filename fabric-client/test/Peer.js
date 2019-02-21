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
/* eslint-disable no-useless-call */

const rewire = require('rewire');
const PeerRewire = rewire('../lib/Peer');
const Peer = require('../lib/Peer');

const chai = require('chai');
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const sinon = require('sinon');
const fabprotos = require('fabric-protos');

describe('Peer', () => {
	const peerLogger = PeerRewire.__get__('logger');

	beforeEach(() => {
		sinon.spy(peerLogger, 'debug');
		sinon.spy(peerLogger, 'error');
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('#constructor', () => {

		it('should not permit creation with a non-valid url', () => {
			(() => {
				new Peer('xxx');
			}).should.throw(/Invalid protocol/);
		});

		it('should not permit creation without an url', () => {
			(() => {
				new Peer();
			}).should.throw(TypeError);
		});
	});

	describe('#close', () => {
		it('should call close on the endorser client if it exists', () => {
			const peer = new Peer('grpc://host:2700');

			const mockClose = sinon.stub();
			const mockPC = sinon.stub();
			mockPC.close = mockClose;

			// replace with the mock item
			peer._endorserClient = mockPC;

			// call
			peer.close();

			// assert
			sinon.assert.called(mockClose);
		});

		it('should call close on the discovery client if it exists', () => {
			const peer = new Peer('grpc://host:2700');

			const mockClose = sinon.stub();
			const mockPC = sinon.stub();
			mockPC.close = mockClose;

			// replace with the mock item
			peer._discoveryClient = mockPC;

			// call
			peer.close();

			// assert
			sinon.assert.called(mockClose);
		});
	});

	describe('#sendProposal', () => {
		async function sendProposalAndAssertPeerDetails(peer, ...args) {
			try {
				const result = await peer.sendProposal(...args);
				should.exist(result.peer, `No peer property on response returned from sendProposal(): ${result}`);
				result.peer.should.deep.equal(peer.getCharacteristics());
				return result;
			} catch (error) {
				should.exist(error.peer, `No peer property on error thrown from sendProposal(): ${error}`);
				error.peer.should.deep.equal(peer.getCharacteristics());
				throw error;
			}
		}

		it('should log function entry', async () => {
			const peer = new PeerRewire('grpc://host:2700');

			await sendProposalAndAssertPeerDetails(peer).should.be.rejected;
			sinon.assert.calledWith(peerLogger.debug, '%s - Start ----%s %s', 'sendProposal', 'host:2700', 'grpc://host:2700');
		});

		it('should reject if no proposal', async () => {
			const peer = new Peer('grpc://host:2700');
			await sendProposalAndAssertPeerDetails(peer).should.be.rejectedWith(/Missing proposal to send to peer/);
		});

		it('should reject on timeout', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			function Fake(params, callback) {
				setTimeout(() => {
					callback.call(null, 'TEST_FAIL');
				}, 10);
			}

			const endorserClient = sinon.stub();
			endorserClient.processProposal = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._endorserClient = endorserClient;

			await sendProposalAndAssertPeerDetails(peer, 'deliver', 0).should.be.rejectedWith('Timeout');
		});

		it('should log and reject Error object on proposal response error string', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			const expectedError = 'I_AM_AN_ERROR';
			const endorserClient = sinon.stub();
			endorserClient.processProposal = sinon.stub().callsArgWith(1, expectedError);

			const peerUrl = 'grpc://host:2700';
			const peer = new PeerRewire(peerUrl);
			peer._endorserClient = endorserClient;

			await sendProposalAndAssertPeerDetails(peer, 'deliver').should.be.rejectedWith(expectedError);
			sinon.assert.calledWith(peerLogger.error, sinon.match.string, 'sendProposal', peerUrl, expectedError);
		});

		it('should reject Error object on proposal response error object', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			const expectedError = new Error('I_AM_AN_ERROR');
			const endorserClient = sinon.stub();
			endorserClient.processProposal = sinon.stub().callsArgWith(1, expectedError);

			const peerUrl = 'grpc://host:2700';
			const peer = new PeerRewire(peerUrl);
			peer._endorserClient = endorserClient;

			await sendProposalAndAssertPeerDetails(peer, 'deliver').should.be.rejectedWith(expectedError);
			sinon.assert.calledWith(peerLogger.error, sinon.match.string, 'sendProposal', peerUrl, expectedError);
		});

		it('should log and reject on null proposal response', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			const endorserClient = sinon.stub();
			endorserClient.processProposal = sinon.stub().callsArgWith(1, undefined, null);

			const peerUrl = 'grpc://host:2700';
			const peer = new PeerRewire(peerUrl);
			peer._endorserClient = endorserClient;

			await sendProposalAndAssertPeerDetails(peer, 'deliver').should.be.rejectedWith(peerUrl);
			sinon.assert.calledWith(peerLogger.error, sinon.match.string, 'sendProposal', peerUrl, null);
		});

		it('should log and reject on invalid proposal response', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			const response = {data: 'invalid'};
			const endorserClient = sinon.stub();
			endorserClient.processProposal = sinon.stub().callsArgWith(1, undefined, response);

			const peerUrl = 'grpc://host:2700';
			const peer = new PeerRewire(peerUrl);
			peer._endorserClient = endorserClient;

			await sendProposalAndAssertPeerDetails(peer, 'deliver').should.be.rejectedWith(peerUrl);
			sinon.assert.calledWith(peerLogger.error, sinon.match.string, 'sendProposal', peerUrl, response);
		});

		it('should resolve on valid proposal response', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			const proposalResponse = {
				response: {
					status: 418,
					message: 'passed_values'
				}
			};
			const endorserClient = sinon.stub();
			endorserClient.processProposal = sinon.stub().callsArgWith(1, undefined, proposalResponse);

			const peerUrl = 'grpc://host:2700';
			const peer = new PeerRewire(peerUrl);
			peer._endorserClient = endorserClient;

			const result = await sendProposalAndAssertPeerDetails(peer, 'deliver');
			result.should.include(proposalResponse);
			sinon.assert.calledWith(peerLogger.debug, sinon.match.string, 'sendProposal', peerUrl, proposalResponse.response.status);
		});
	});

	describe('#sendDiscovery', () => {
		it('should reject if no request to send', async () => {
			const peer = new Peer('grpc://host:2700');
			await peer.sendDiscovery().should.be.rejectedWith(/Missing request to send to peer discovery service/);
		});

		it('should reject on timeout', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			function Fake(params, callback) {
				setTimeout(() => {
					callback.call(null, 'timeout not honoured');
				}, 10);
			}

			const discoveryClient = sinon.stub();
			discoveryClient.discover = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._discoveryClient = discoveryClient;

			await peer.sendDiscovery('deliver', 0).should.be.rejectedWith(/REQUEST_TIMEOUT/);
		});

		it('should reject Error object on discover Response error string', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			function Fake(params, callback) {
				callback.call(null, 'i_am_an_error');
			}

			const discoveryClient = sinon.stub();
			discoveryClient.discover = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._discoveryClient = discoveryClient;

			await peer.sendDiscovery('deliver').should.be.rejectedWith(/i_am_an_error/);
		});

		it('should reject Error object on discover Response error object', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			function Fake(params, callback) {
				callback.call(null, new Error('FORCED_ERROR'));
			}

			const discoveryClient = sinon.stub();
			discoveryClient.discover = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._discoveryClient = discoveryClient;

			await peer.sendDiscovery('deliver').should.be.rejectedWith(/FORCED_ERROR/);
		});

		it('should reject Error object on null response from discovery', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			function Fake(params, callback) {
				callback.call(null, null, null);
			}

			const discoveryClient = sinon.stub();
			discoveryClient.discover = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._discoveryClient = discoveryClient;

			await peer.sendDiscovery('deliver').should.be.rejectedWith(/GRPC client failed to get a proper response from the peer/);
		});

		it('should resolve on good response from discover', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			const myResponse = {me: 'valid'};
			function Fake(params, callback) {
				callback.call(null, null, myResponse);
			}

			const discoveryClient = sinon.stub();
			discoveryClient.discover = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._discoveryClient = discoveryClient;

			const response = await peer.sendDiscovery('deliver');
			response.should.deep.equal(myResponse);
			response.peer.name.should.equal('host:2700');
			response.peer.url.should.equal('grpc://host:2700');
		});

	});

	describe('#toString', () => {

		it('should return a string representation of the object', () => {
			const peer = new Peer('grpc://host:2700');
			peer.toString().should.equal('Peer:{url:grpc://host:2700}');
		});
	});

	describe('#sendTokenCommand', () => {
		it('should log function entry', async () => {
			const peer = new PeerRewire('grpc://host:2700');

			await peer.sendTokenCommand().should.be.rejected;
			sinon.assert.calledWith(peerLogger.debug, '%s - Start ----%s %s', 'sendTokenCommand', 'host:2700', 'grpc://host:2700');
		});

		it('should log and return signed command response', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			const myResponse = new fabprotos.token.SignedCommandResponse();
			function Fake(params, callback) {
				callback.call(null, null, myResponse);
			}

			const proverClient = sinon.stub();
			proverClient.processCommand = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._proverClient = proverClient;

			const response = await peer.sendTokenCommand('test');
			response.should.deep.equal(myResponse);
			sinon.assert.calledWith(peerLogger.debug, '%s - Received signed command response %s from peer "%s"');
		});

		it('should reject if no command', async () => {
			const peer = new Peer('grpc://host:2700');
			await peer.sendTokenCommand().should.be.rejectedWith(/Missing command parameter to send to peer/);
		});

		it('should reject on timeout', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());

			function Fake(params, callback) {
				setTimeout(() => {
					callback.call(null, 'timeout not honoured');
				}, 10);
			}

			const proverClient = sinon.stub();
			proverClient.processCommand = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._proverClient = proverClient;

			await peer.sendTokenCommand('deliver', 0).should.be.rejectedWith(/REQUEST_TIMEOUT/);
		});

		it('should log and reject error objec when proverClient returns error', async () => {
			PeerRewire.__set__('Peer.prototype.waitForReady', sinon.stub().resolves());
			const proverClient = sinon.stub();

			function Fake(params, callback) {
				callback.call(null, new Error('FORCED_ERROR'));
			}

			proverClient.processCommand = sinon.stub().callsFake(Fake);

			const peer = new PeerRewire('grpc://host:2700');
			peer._proverClient = proverClient;

			await peer.sendTokenCommand('deliver').should.be.rejectedWith(/FORCED_ERROR/);
			sinon.assert.calledWith(peerLogger.error, '%s - Received error %s from peer %s');
		});
	});
});
