/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require('chai');
const assert = require('chai').assert;
const rewire = require('rewire');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();

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
			client.getConfigSetting = () => {
				return {pattern: '^[a-z][a-z0-9.-]*$', flags: ''};
			};
			channel = client.newChannel('mychannel');
			channel.name.should.equal('mychannel');
		});
		it('should be able to create a channel with no regex pattern', () => {
			client.getConfigSetting = () => {
				return {};
			};
			channel = client.newChannel('mychannel');
			channel.name.should.equal('mychannel');
		});
		it('should not be able to create a channel', () => {
			(() => {
				client.getConfigSetting = () => {
					return {pattern: '^[A-Z]*$', flags: 'g'};
				};
				channel = client.newChannel('mychannel');
			}).should.throw('Failed to create Channel. channel name should match Regex /^[A-Z]*$/g, but got mychannel');
		});
	});

	describe('#close', () => {
		it('should be able close', () => {
			channel.close();
		});
		it('should be able close', () => {
			channel.addPeer(client.newPeer('peer1'));
			channel.addOrderer(client.newOrderer('orderer1'));
			channel.close();
		});
	});
	describe('#newEndorsement', () => {
		it('should require a chaincode name', () => {
			(() => {
				channel.newEndorsement();
			}).should.throw('Missing chaincodeName parameter');
		});

		it('should be able to create an endorsement', () => {
			channel.newEndorsement('chaincodename');
		});
	});
	describe('#newQuery', () => {
		it('should require a chaincode name', () => {
			(() => {
				channel.newQuery();
			}).should.throw('Missing chaincodeName parameter');
		});

		it('should be able to create a query', () => {
			channel.newQuery('chaincodename');
		});
	});
	describe('#newCommit', () => {
		it('should require a chaincode name', () => {
			(() => {
				channel.newCommit();
			}).should.throw('Missing chaincodeName parameter');
		});

		it('should be able to create a commit', () => {
			channel.newCommit('chaincodename');
		});
	});
	describe('#newEventService', () => {
		it('should require a name', () => {
			(() => {
				channel.newEventService();
			}).should.throw('Missing name parameter');
		});

		it('should be able to create an eventService', () => {
			channel.newEventService('name');
		});
	});
	describe('#newDiscovery', () => {
		it('should require a name', () => {
			(() => {
				channel.newDiscovery();
			}).should.throw('Missing name parameter');
		});

		it('should be able to create a discovery', () => {
			channel.newDiscovery('name');
		});
	});
	describe('#getMspids', () => {
		it('should be able to getMspids when none', () => {
			const list = channel.getMspids();
			assert.isTrue(Array.isArray(list), 'getMspids returns and array');
		});
		it('should be able to getMspids', () => {
			channel.addMSP({id: 'mymsp'});
			const list = channel.getMspids();
			assert.isTrue(Array.isArray(list), 'getMspids returns and array');
		});
	});
	describe('#getMSP', () => {
		it('should require a id', () => {
			(() => {
				channel.getMSP();
			}).should.throw('Missing id parameter');
		});
		it('should be able to getMSP', () => {
			channel.getMSP('id');
		});
	});
	describe('#removeMSP', () => {
		it('should require a id', () => {
			(() => {
				channel.removeMSP();
			}).should.throw('Missing id parameter');
		});
		it('should be able call removeMSP with nonexistent msp', () => {
			assert.isFalse(channel.removeMSP('id'), 'Should get false if no msp top remove');
		});
		it('should be able removeMSP', () => {
			channel.addMSP({id: 'id'});
			assert.isTrue(channel.removeMSP('id'), 'Should get true if remove msp');
		});
	});
	describe('#addMSP', () => {
		it('should require a msp', () => {
			(() => {
				channel.addMSP();
			}).should.throw('Missing msp parameter');
		});
		it('should require a msp.id', () => {
			(() => {
				channel.addMSP('msp');
			}).should.throw('MSP does not have an id');
		});
		it('should be able to addMSP', () => {
			channel.addMSP({id: 'msp'});
		});
		it('should see already exist msp.id', () => {
			(() => {
				channel.addMSP({id: 'msp'});
				channel.addMSP({id: 'msp'});
			}).should.throw('MSP msp already exists');
		});
		it('should be able to addMSP with replace true', () => {
			channel.addMSP({id: 'msp'});
			channel.addMSP({id: 'msp'}, true);
		});
	});
	describe('#addPeer', () => {
		it('should require a peer', () => {
			(() => {
				channel.addPeer();
			}).should.throw('Missing peer parameter');
		});
		it('should require a peer.name', () => {
			(() => {
				channel.addPeer('peer');
			}).should.throw('Peer does not have a name');
		});
		it('should require a peer type', () => {
			(() => {
				channel.addPeer({name: 'peer'});
			}).should.throw('Missing valid peer instance');
		});
		it('should be able to addPeer', () => {
			channel.addPeer({name: 'peer', type: 'Peer'});
		});
		it('should find a peer.name', () => {
			(() => {
				channel.addPeer({name: 'peer', type: 'Peer'});
				channel.addPeer({name: 'peer', type: 'Peer'});
			}).should.throw('Peer peer already exists');
		});
		it('should be able to addPeer with replace true', () => {
			channel.addPeer({name: 'peer', type: 'Peer'});
			channel.addPeer({name: 'peer', type: 'Peer'}, true);
		});
	});
	describe('#removePeer', () => {
		it('should require a peer', () => {
			(() => {
				channel.removePeer();
			}).should.throw('Missing peer parameter');
		});
		it('should require a peer', () => {
			(() => {
				channel.removePeer('peer');
			}).should.throw('Missing valid peer instance');
		});
		it('should be able call removePeer without a peer added', () => {
			const peer = client.newPeer('peer');
			assert.isFalse(channel.removePeer(peer), 'should be able to call remove without a peer added');
		});
		it('should be able removePeer', () => {
			const peer = client.newPeer('peer');
			channel.addPeer(peer);
			assert.isTrue(channel.removePeer(peer), 'should be able to removePeer');
		});
	});
	describe('#getPeer', () => {
		it('should require a peer name', () => {
			(() => {
				channel.getPeer();
			}).should.throw('Missing name parameter');
		});
		it('should be able to getPeer null', () => {
			const check = channel.getPeer('peer');
			assert.isUndefined(check, 'Able to get a undefined peer');
		});
		it('should be able to getPeer', () => {
			const peer = client.newPeer('peer');
			channel.addPeer(peer);
			const check = channel.getPeer('peer');
			assert.deepEqual(peer, check, 'Able to get a peer');
		});
	});
	describe('#addOrderer', () => {
		it('should require a orderer', () => {
			(() => {
				channel.addOrderer();
			}).should.throw('Missing orderer parameter');
		});
		it('should require a orderer.name', () => {
			(() => {
				channel.addOrderer('orderer');
			}).should.throw('Orderer does not have a name');
		});
		it('should require orderer type', () => {
			(() => {
				channel.addOrderer({name: 'orderer'});
			}).should.throw('Missing valid orderer instance');
		});
		it('should be able to addOrderer', () => {
			channel.addOrderer({name: 'orderer', type: 'Orderer'});
		});
		it('should find a orderer.name', () => {
			(() => {
				channel.addOrderer({name: 'orderer', type: 'Orderer'});
				channel.addOrderer({name: 'orderer', type: 'Orderer'});
			}).should.throw('Orderer orderer already exists');
		});
		it('should be able to addOrderer with replace true', () => {
			channel.addOrderer({name: 'orderer', type: 'Orderer'});
			channel.addOrderer({name: 'orderer', type: 'Orderer'}, true);
		});
	});
	describe('#removeOrderer', () => {
		it('should require a Orderer', () => {
			(() => {
				channel.removeOrderer();
			}).should.throw('Missing orderer parameter');
		});
		it('should require a orderer', () => {
			(() => {
				channel.removeOrderer('orderer');
			}).should.throw('Missing valid orderer instance');
		});
		it('should be able call removeOrderer and not fail if no orderer', () => {
			const orderer = client.newOrderer('orderer');
			assert.isFalse(channel.removeOrderer(orderer), 'should not remove orderer');
		});
		it('should be able to removeOrderer', () => {
			const orderer = client.newOrderer('orderer');
			channel.addOrderer(orderer);
			assert.isTrue(channel.removeOrderer(orderer), 'should be able to remove orderer');
		});
	});
	describe('#getOrderer', () => {
		it('should require a orderer name', () => {
			(() => {
				channel.getOrderer();
			}).should.throw('Missing name parameter');
		});
		it('should be able to getOrderer null', () => {
			const check = channel.getOrderer('orderer');
			assert.isUndefined(check, 'Able to get a undefined orderer');
		});
		it('should be able to getOrderer', () => {
			const orderer = client.newOrderer('orderer');
			channel.addOrderer(orderer);
			const check = channel.getOrderer('orderer');
			assert.deepEqual(orderer, check, 'Able to get a orderer');
		});
	});
	describe('#getPeers', () => {
		it('should be able to getPeers empty array', () => {
			const check = channel.getPeers();
			assert.isEmpty(check, 'Able to get an empty array');
		});
		it('should be able to getPeers', () => {
			channel.addPeer(client.newPeer('peer1', 'msp1'));
			channel.addPeer(client.newPeer('peer2', 'msp2'));
			const check = channel.getPeers();
			assert.lengthOf(check, 2, 'Able to get a list of 2');
		});
		it('should be able to getPeers', () => {
			channel.addPeer(client.newPeer('peer1', 'msp1'));
			channel.addPeer(client.newPeer('peer2', 'msp2'));
			const check = channel.getPeers('msp1');
			assert.lengthOf(check, 1, 'Able to get a list of 2');
		});
	});
	describe('#getOrderers', () => {
		it('should be able to getOrderers empty array', () => {
			const check = channel.getOrderers();
			assert.isEmpty(check, 'Able to get an empty array');
		});
		it('should be able to getOrderers', () => {
			channel.addOrderer(client.newOrderer('orderer1', 'msp1'));
			channel.addOrderer(client.newOrderer('orderer2', 'msp2'));
			const check = channel.getOrderers();
			assert.lengthOf(check, 2, 'Able to get a list of 2');
		});
		it('should be able to getOrderers', () => {
			channel.addOrderer(client.newOrderer('orderer1', 'msp1'));
			channel.addOrderer(client.newOrderer('orderer2', 'msp2'));
			const check = channel.getOrderers('msp1');
			assert.lengthOf(check, 1, 'Able to get a list of 1');
		});
	});
	describe('#getTargetOrderers', () => {
		it('should require targets', () => {
			(() => {
				channel.getTargetOrderers();
			}).should.throw('Missing targets parameter');
		});
		it('should be an array of targets', () => {
			(() => {
				channel.getTargetOrderers('target');
			}).should.throw('Targets must be an array');
		});
		it('should be not found targets', () => {
			(() => {
				channel.getTargetOrderers(['name1']);
			}).should.throw('Orderer named name1 not found');
		});
		it('should be not valid targets', () => {
			(() => {
				const not_valid = client.newPeer('not_valid');
				channel.getTargetOrderers([not_valid]);
			}).should.throw('Target Orderer is not valid');
		});
		it('should be able to getTargetOrderers by name', () => {
			channel.addOrderer(client.newOrderer('name1', 'msp1'));
			channel.addOrderer(client.newOrderer('name2', 'msp2'));
			const check1 = channel.getTargetOrderers(['name1', 'name2']);
			assert.lengthOf(check1, 2, 'Able to get a list of 2');
			const check2 = channel.getTargetOrderers(['name2']);
			assert.lengthOf(check2, 1, 'Able to get a list of 1');
		});
		it('should be able to getTargetOrderers by object', () => {
			const orderer = client.newOrderer('name1');
			const check = channel.getTargetOrderers([orderer]);
			assert.lengthOf(check, 1, 'Able to get a list of 1');
		});
	});
	describe('#getTargetPeers', () => {
		it('should require targets', () => {
			(() => {
				channel.getTargetPeers();
			}).should.throw('Missing targets parameter');
		});
		it('should be an array of targets', () => {
			(() => {
				channel.getTargetPeers('target');
			}).should.throw('Targets must be an array');
		});
		it('should be not found targets', () => {
			(() => {
				channel.getTargetPeers(['name1']);
			}).should.throw('Peer named name1 not found');
		});
		it('should be not valid targets', () => {
			(() => {
				const not_valid = client.newOrderer('not_valid');
				channel.getTargetPeers([not_valid]);
			}).should.throw('Target Peer is not valid');
		});
		it('should be able to getTargetPeers by name', () => {
			channel.addPeer(client.newPeer('name1', 'msp1'));
			channel.addPeer(client.newPeer('name2', 'msp2'));
			const check1 = channel.getTargetPeers(['name1', 'name2']);
			assert.lengthOf(check1, 2, 'Able to get a list of 2');
			const check2 = channel.getTargetPeers(['name2']);
			assert.lengthOf(check2, 1, 'Able to get a list of 1');
		});
		it('should be able to getTargetPeers by object', () => {
			const peer = client.newPeer('name1');
			const check = channel.getTargetPeers([peer]);
			assert.lengthOf(check, 1, 'Able to get a list of 1');
		});
	});
	describe('#buildChannelHeader', () => {
		it('should require type', () => {
			(() => {
				channel.buildChannelHeader();
			}).should.throw('Missing type parameter');
		});
		it('should require chaincode_id', () => {
			(() => {
				channel.buildChannelHeader('type');
			}).should.throw('Missing chaincode_id parameter');
		});
		it('should require tx_id', () => {
			(() => {
				channel.buildChannelHeader('type', 'chaincode_id');
			}).should.throw('Missing tx_id parameter');
		});
		it('should be able to buildChannelHeader', () => {
			client.getClientCertHash = () => {
				return Buffer.from('clientCert');
			};
			const channel_header = channel.buildChannelHeader(1, 'mychaincode', '1234');
			assert.equal(channel_header.getTxId(), '1234', 'Able to build object with tx_id');
			assert.equal(channel_header.getChannelId(), 'mychannel', 'Able to build object with channelID');
		});
	});
	describe('#toString', () => {
		it('should be able to toString', () => {
			const channel_string = channel.toString();
			assert.equal(channel_string,
				'{"name":"mychannel","orderers":"N/A","peers":"N/A"}',
				'toString has all this'
			);
		});
		it('should be able to toString', () => {
			channel.addPeer(client.newPeer('peer1'));
			channel.addOrderer(client.newOrderer('orderer1'));
			const channel_string = channel.toString();
			assert.equal(channel_string,
				'{"name":"mychannel","orderers":["Orderer- name: orderer1, url:<not connected>"],"peers":["Peer- name: peer1, url:<not connected>"]}',
				'toString has all this'
			);
		});
	});
});
