/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable no-useless-call */

const rewire = require('rewire');
const PeerRewire = rewire('../lib/Peer');
const Peer = require('../lib/Peer');
const Client = require('../lib/Client');

const chai = require('chai');
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const sinon = require('sinon');

describe('Peer', () => {
	const client = new Client('myclient');
	let peer;
	let endpoint;

	beforeEach(async () => {
		peer = new PeerRewire('mypeer', client, 'msp1');
		endpoint = client.newEndpoint({url: 'grpc://host:2700'});
		peer.endpoint = endpoint;
		peer.connected = true;
		peer.options = {};
		peer.service = sinon.stub();
	});

	describe('#constructor', () => {
		it('should require name', () => {
			(() => {
				new Peer();
			}).should.throw('Missing name parameter');
		});
		it('should require client', () => {
			(() => {
				new Peer('name');
			}).should.throw('Missing client parameter');
		});
	});

	describe('#sendProposal', () => {
		it('should reject if no proposal', async () => {
			await peer.sendProposal().should.be.rejectedWith(/Missing signedProposal parameter/);
		});

		it('should reject if not connected', async () => {
			peer.connected = false;
			await peer.sendProposal('send').should.be.rejectedWith(/is not connected/);
		});
		it('should reject on timeout', async () => {
			function Fake(params, callback) {
				setTimeout(() => {
					callback.call(null, 'timeout not honoured');
				}, 10);
			}
			peer.service.processProposal = sinon.stub().callsFake(Fake);

			await peer.sendProposal('send', 0).should.be.rejectedWith(/REQUEST_TIMEOUT/);

		});
		it('should reject Error object on proposal response error string', async () => {
			function Fake(params, callback) {
				callback.call(null, 'i_am_an_error', null);
			}
			peer.service.processProposal = sinon.stub().callsFake(Fake);

			await peer.sendProposal('send').should.be.rejectedWith(/i_am_an_error/);
		});
		it('should reject Error object on send response error object', async () => {
			function Fake(params, callback) {
				callback.call(null, new Error('FORCED_ERROR'), null);
			}
			peer.service.processProposal = sinon.stub().callsFake(Fake);

			await peer.sendProposal('send').should.be.rejectedWith(/FORCED_ERROR/);
		});

		it('should eject on undefined proposal response', async () => {
			function Fake(params, callback) {
				callback.call(null, null, null);
			}
			peer.service.processProposal = sinon.stub().callsFake(Fake);

			await peer.sendProposal('send').should.be.rejectedWith(/GRPC service got a null or undefined response from the peer/);
		});

		it('should log and reject on invalid proposal response', async () => {
			function Fake(params, callback) {
				callback.call(null, null, {data: 'invalid'});
			}
			peer.service.processProposal = sinon.stub().callsFake(Fake);

			await peer.sendProposal('send').should.be.rejectedWith(/GRPC service failed to get a proper response from the peer/);
		});

		it('should reject on proposal response error status greater than or equal to 400', async () => {
			function Fake(params, callback) {
				callback.call(null, null, {response: {status: 400, message: 'fail_string'}});
			}
			peer.service.processProposal = sinon.stub().callsFake(Fake);

			const results = await peer.sendProposal('send');
			results.response.status.should.equal(400);
			results.response.message.should.equal('fail_string');
			results.connection.name.should.equal('mypeer');
			results.connection.url.should.equal('grpc://host:2700');
		});

		it('should resolve on valid proposal response', async () => {
			const myResponse = {response: {status: 399, message: 'passed_values'}};
			function Fake(params, callback) {
				callback.call(null, null, myResponse);
			}
			peer.service.processProposal = sinon.stub().callsFake(Fake);

			const response = await peer.sendProposal('send');
			response.should.deep.equal(myResponse);
			response.connection.name.should.equal('mypeer');
			response.connection.url.should.equal('grpc://host:2700');
		});

		it('should mark errors from chaincode as proposal response', async () => {
			const myResponse = {response: {status: 500, message: 'some error'}};
			function Fake(params, callback) {
				callback.call(null, null, myResponse);
			}

			peer.service.processProposal = sinon.stub().callsFake(Fake);

			try {
				const results = await peer.sendProposal('send');
				results.response.status.should.equal(500);
				results.response.message.should.equal('some error');
				results.connection.name.should.equal('mypeer');
				results.connection.url.should.equal('grpc://host:2700');
			} catch (err) {
				should.fail();
			}
		});

		it('should not mark errors as proposal response if not a proposal response', async () => {
			function Fake(params, callback) {
				setTimeout(() => {
					callback.call(null, 'timeout not honoured');
				}, 10);
			}
			peer.service.processProposal = sinon.stub().callsFake(Fake);

			try {
				await peer.sendProposal('send', 0);
				should.fail();
			} catch (error) {
				should.equal(error.isProposalResponse, undefined);
			}
		});
	});
});
