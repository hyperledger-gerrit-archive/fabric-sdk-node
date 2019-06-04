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
const Remote = rewire('../lib/Remote');
const FabricBase = require('..');
const {Utils} = require('fabric-common');



describe('Remote', () => {
	let client;
	let peer;

	beforeEach(() => {
		client = new Client('myclient');
		remote = new Remote('myremote', client);
	});

	describe('#constructor', () => {
		it('should require a name', () => {
			(() => {
				new Remote();
			}).should.throw('Missing name parameter');
		});

		it('should require a client', () => {
			(() => {
				new Remote('myremote');
			}).should.throw('Missing client parameter');
		});

		it('should be able to create a peer', () => {
			const remote = new Remote('myremote', client);
			remote.name.should.equal('myremote');
		});
	});

	
});
