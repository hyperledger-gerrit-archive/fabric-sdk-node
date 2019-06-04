/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const rewire = require('rewire');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinonChai = require('sinon-chai');
chai.use(chaiAsPromised);
chai.use(sinonChai);

const Client = require('../lib/Client');
const Peer = rewire('../lib/Peer');

describe('Peer', () => {
	let client;

	beforeEach(() => {
		client = new Client('myclient');
	});

	describe('#constructor', () => {
		it('should require a name', () => {
			(() => {
				new Peer();
			}).should.throw('Missing name parameter');
		});

		it('should require a client', () => {
			(() => {
				new Peer('mypeer');
			}).should.throw('Missing client parameter');
		});

		it('should be able to create a peer', () => {
			const peer = new Peer('mypeer', client);
			peer.name.should.equal('mypeer');
		});
	});
});
