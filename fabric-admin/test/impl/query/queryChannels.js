/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const {Client, User} = require('fabric-common');

const {QueryChannels} = require('../../../src/impl/query/queryChannels');

const sinon = require('sinon');
const fabprotos = require('fabric-protos');

describe('QueryChannels', () => {
	let client;
	let user;
	let peer1;
	let idx;
	let channel;
	let endorsement;
	let proposalResponse;
	let queryChannelsResponse;

	beforeEach(() => {
		queryChannelsResponse = new fabprotos.protos.ChannelQueryResponse();
		const channelInfo = new fabprotos.protos.ChannelInfo();
		channelInfo.setChannelId('mychannel');
		const channels = [];
		channels.push(channelInfo);
		queryChannelsResponse.setChannels(channels);

		endorsement = sinon.stub();
		proposalResponse = {
			responses: [{
				response: {
					status: 200,
					message: 'message',
					payload: queryChannelsResponse.toBuffer()
				},
				payload: Buffer.from('payload'),
				endorsment: {
					endorser: Buffer.from('endorser'),
					signature: Buffer.from('signature')
				}
			}]
		};
		endorsement.send = sinon.stub().resolves(proposalResponse);
		endorsement.build = sinon.stub();
		endorsement.sign = sinon.stub();
		channel = sinon.stub();
		channel.newEndorsement = sinon.stub().returns(endorsement);
		client = new Client('client');
		idx = sinon.stub();
		idx.calculateTransactionId = sinon.stub();
		client.newIdentityContext = sinon.stub().returns(idx);
		user = new User('user');
		peer1 = client.newEndorser('endorser');
		client.newChannel = sinon.stub().returns(channel);
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('#contructor', () => {
		it('should create', () => {
			const queryChannels = new QueryChannels(client, user);
			queryChannels.idx.should.equal(idx);
		});
		it('should create with options', () => {
			const options = {
				requestTimeout: 3333
			};
			const queryChannels = new QueryChannels(client, user, options);
			queryChannels.requestTimeout.should.equal(3333);
		});
	});

	describe('#query', () => {
		let queryChannels;
		let options;

		beforeEach(() => {
			options = {
				target: peer1,
				requestTimeout: 3000
			};
			queryChannels = new QueryChannels(client, user);
		});

		it('queries for channels good response', async () => {
			const results = await queryChannels.query(options);
			results.channels[0].should.equal('mychannel');
		});


	});
});
