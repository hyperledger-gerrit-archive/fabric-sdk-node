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

const Client = require('../lib/Client');
const Peer = rewire('../lib/Peer');
const FabricBase = require('..');
const {Utils} = require('fabric-common');



describe('Peer', () => {
	let client;
	let peer;

	beforeEach(() => {
		client = new Client('myclient');
		peer = new Peer('mypeer', client);
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
