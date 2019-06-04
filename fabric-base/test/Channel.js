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

const Channel = rewire('../lib/Channel');
const Client = require('../lib/Client');



describe('Channel', () => {
	let client;
	let channel;

	beforeEach(() => {
		client = new Client('myclient');
		channel = new Channel('mychannel', client);
	});

	describe('#constructor', () => {
		it('should require a name', () => {
			(() => {
				new Channel();
			}).should.throw('Missing name parameter');
		});

		it('should require a client', () => {
			(() => {
				new Channel('mychannel');
			}).should.throw('Missing client parameter');
		});

		it('should be able to create a channel', () => {
			channel.name.should.equal('mychannel');
		});
	});

	describe('#newProposal', () => {
		it('should require a chaincode', () => {
			(() => {
				channel.newProposal();
			}).should.throw('Missing chaincode parameter');
		});

		it('should be able to create a proposal', () => {
			channel.name.should.equal('mychannel');
		});
	});
});
