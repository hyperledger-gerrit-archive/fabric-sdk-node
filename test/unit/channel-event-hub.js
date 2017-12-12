/**
 * Copyright 2016-2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

'use strict';

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var testutil = require('./util.js');
var User = require('fabric-client/lib/User.js');
var utils = require('fabric-client/lib/utils.js');
var test_user = require('./user.js');

var Client = require('fabric-client');
var Peer = require('fabric-client/lib/Peer.js');
var ChannelEventHub = require('fabric-client/lib/ChannelEventHub.js');
var sdkUtils = require('fabric-client/lib/utils.js');

test('\n\n** ChannelEventHub tests\n\n', (t) => {
	testutil.resetDefaults();

	let client = new Client();
	let channel = client.newChannel('mychannel');
	let peer = client.newPeer('grpc://somehost.com:8888');

	let eh;

	t.throws(
		() => {
			eh = new ChannelEventHub();
		},
		/Missing required argument: channel/,
		'Must pass in a channel'
	);

	t.throws(
		() => {
			eh = new ChannelEventHub(channel);
			eh = new ChannelEventHub();
		},
		/Missing required argument: peer/,
		'Must pass in a peer'
	);

	t.throws(
		() => {
			eh = new ChannelEventHub(channel, peer);
			eh.connect();
		},
		/The clientContext has not been properly initialized, missing userContext/,
		'Must pass in a clientContext that has the user context already initialized'
	);

	client._userContext = {};

	t.throws(
		() => {
			eh.registerBlockEvent();
		},
		/Missing "onEvent" parameter/,
		'Check the Missing "onEvent" parameter'
	);

	t.throws(
		() => {
			eh.unregisterBlockEvent();
		},
		/Missing "block_registration_number" parameter/,
		'Check the Missing "block_registration_number" parameter'
	);
	t.throws(
		() => {
			eh.registerTxEvent();
		},
		/Missing "txid" parameter/,
		'Check the Missing "txid" parameter'
	);
	t.throws(
		() => {
			eh.registerTxEvent('txid');
		},
		/Missing "onEvent" parameter/,
		'Check the Missing "onEvent" parameter'
	);
	t.throws(
		() => {
			eh.unregisterTxEvent();
		},
		/Missing "txid" parameter/,
		'Check the Missing "txid" parameter'
	);
	t.throws(
		() => {
			eh.registerChaincodeEvent();
		},
		/Missing "ccid" parameter/,
		'Check the Missing "ccid" parameter'
	);
	t.throws(
		() => {
			eh.registerChaincodeEvent('ccid');
		},
		/Missing "eventname" parameter/,
		'Check the Missing "eventname" parameter'
	);
	t.throws(
		() => {
			eh.registerChaincodeEvent('ccid','eventname');
		},
		/Missing "onEvent" parameter/,
		'Check the Missing "onEvent" parameter'
	);
	t.throws(
		() => {
			eh.unregisterChaincodeEvent();
		},
		/Missing "listener_handle" parameter/,
		'Check the Missing "listener_handle" parameter'
	);
	t.throws(
		() => {
			eh._checkStartBlock('aaaa');
		},
		/start_block parameter must be valid integer/,
		'Check that we able to see start block is not a number'
	);

	t.end();
});

test('\n\n** ChannelEventHub block callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	var index = eh.registerBlockEvent((block) => {
		t.fail('Should not have called success callback when disconnect() is called');
		t.end();
	}, (error) =>{
		t.pass('Successfully called error callback from disconnect()');
		t.end();
	});

	t.pass('successfully registered block callbacks');
	t.equal(index, 1, 'Check the first block listener is at index 1');

	index = eh.registerBlockEvent(() => {
		// empty method body
	}, () => {
		// empty method body
	});

	t.equal(index, 2, 'Check the 2nd block listener is at index 2');
	t.equal(Object.keys(eh._blockOnEvents).length, 2, 'Check the size of the blockOnEvents hash table');
	t.equal(Object.keys(eh._blockOnErrors).length, 2, 'Check the size of the blockOnErrors hash table');

	eh.disconnect();
});

test('\n\n** ChannelEventHub block callback with replay \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);
	eh._force_reconnect = false;

	var index = eh.registerBlockEvent((block) => {
		t.fail('Should not have called success callback');
		t.end();
	}, (error) =>{
		t.fail('Error callback should not be called');
		t.end();
	});

	t.pass('Successfully registered block callbacks');
	t.equal(index, 1, 'Check the first block listener is at index 1');
	try {
		index = eh.registerBlockEvent((block) => {
			t.fail('Should not have called success callback');
			t.end();
		}, (error) =>{
			t.fail('Should not have called error callback');
			t.end();
		}, 1);
		t.fail('Failed if the block event with a replay is registered after another block event');
	} catch(error) {
		if(error.toString().indexOf('Only one event registration is allowed')) {
			t.pass('Should not be able to register for more than one with replay')
		} else {
			t.fail('Should have gotten the only one event registration error ::'+error.toString());
		}
	}

	eh.unregisterBlockEvent(index);

	try {
		index = eh.registerBlockEvent((block) => {
			t.fail('Should not have called success callback');
			t.end();
		}, (error) =>{
			t.fail('Should not have called error callback');
			t.end();
		}, 1);
		t.pass('Successfully registered a playback block event');
	} catch(error) {
		t.fail( 'Failed - Should be able to register with replay')
	}

	t.equal(index, 2, 'Check the first block listener is at index 2');
	t.equal(Object.keys(eh._blockOnEvents).length, 1, 'Check the size of the blockOnEvents');
	t.equal(Object.keys(eh._blockOnErrors).length, 1, 'Check the size of the blockOnErrors');

	t.end();
});

test('\n\n** ChannelEventHub transaction callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._force_reconnect = false;

	eh.registerTxEvent('txid1', (block) => {
		// empty method body
	}, (error) =>{
		// empty method body
	});
	t.pass('successfully registered transaction callbacks');
	t.equal(Object.keys(eh._transactionOnEvents).length, 1, 'Check the size of the transactionOnEvents hash table');
	t.equal(Object.keys(eh._transactionOnErrors).length, 1, 'Check the size of the transactionOnErrors hash table');

	eh.registerTxEvent('txid1', (block) => {
		t.fail('Should not have called success callback');
		t.end();
	}, (error) =>{
		t.pass('Successfully called transaction error callback');
		t.end();
	});
	t.equal(Object.keys(eh._transactionOnEvents).length, 1,
		'Size of the transactionOnEvents hash table should still be 1 since the listeners are for the same txId');
	t.equal(Object.keys(eh._transactionOnErrors).length, 1,
		'Size of the transactionOnErrors hash table should still be 1 since the listeners are for the same txId');

	eh.registerTxEvent('txid2', (block) => {
		// empty method body
	}, (error) =>{
		// empty method body
	});

	t.equal(Object.keys(eh._transactionOnEvents).length, 2, 'Check the size of the transactionOnEvents hash table');
	t.equal(Object.keys(eh._transactionOnErrors).length, 2, 'Check the size of the transactionOnErrors hash table');

	eh.disconnect();
});

test('\n\n** ChannelEventHub transaction callback with replay \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);
	eh._force_reconnect = false;

	eh.registerTxEvent('transid', (block) => {
		t.fail('Should not have called success callback');
		t.end();
	}, (error) =>{
		t.fail('Error callback should not be called');
		t.end();
	});

	t.pass('Successfully registered transaction callbacks');
	try {
		eh.registerTxEvent('transid', (block) => {
			t.fail('Should not have called success callback');
			t.end();
		}, (error) =>{
			t.fail('Should not have called error callback');
			t.end();
		}, 1);
		t.fail('Failed if the transaction event with a replay is registered after another transaction event');
	} catch(error) {
		if(error.toString().indexOf('Only one event registration is allowed')) {
			t.pass('Should not be able to register for more than one with replay')
		} else {
			t.fail('Should have gotten the only one event registration error ::'+error.toString());
		}
	}

	eh.unregisterTxEvent('transid');

	try {
		eh.registerTxEvent('transid', (block) => {
			t.fail('Should not have called success callback');
			t.end();
		}, (error) =>{
			t.fail('Should not have called error callback');
			t.end();
		}, 1);
		t.pass('Successfully registered a playback transaction event');
	} catch(error) {
		t.fail( 'Failed - Should be able to register with replay')
	}

	t.equal(Object.keys(eh._transactionOnEvents).length, 1, 'Check the size of the transactionOnEvents');
	t.equal(Object.keys(eh._transactionOnErrors).length, 1, 'Check the size of the transactionOnErrors');

	t.end();
});

test('\n\n** ChannelEventHub chaincode callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	eh.registerChaincodeEvent('ccid1', 'eventfilter', (block) => {
		t.fail('Should not have called success callback');
		t.end();
	}, (error) =>{
		t.pass('Successfully called chaincode error callback');
		t.end();
	});
	t.pass('successfully registered chaincode callbacks');

	t.equal(Object.keys(eh._chaincodeRegistrants).length, 1, 'Check the size of the chaincodeRegistrants hash table');

	eh.registerChaincodeEvent('ccid1', 'eventfilter', (block) => {
		// empty method body
	}, (error) =>{
		// empty method body
	});

	t.equal(Object.keys(eh._chaincodeRegistrants).length, 1,
		'Size of the chaincodeRegistrants hash table should still be 1 because both listeners are for the same chaincode');

	eh.registerChaincodeEvent('ccid2', 'eventfilter', (block) => {
		// empty method body
	}, (error) =>{
		// empty method body
	});

	t.equal(Object.keys(eh._chaincodeRegistrants).length, 2,
		'Size of the chaincodeRegistrants hash table should still be 2');

	eh.disconnect();
});


test('\n\n** ChannelEventHub chaincode callback with replay \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);
	eh._force_reconnect = false;

	let handle = eh.registerChaincodeEvent('ccid1', 'eventfilter', (block) => {
		t.fail('Should not have called success callback');
		t.end();
	}, (error) =>{
		t.fail('Error callback should not be called');
		t.end();
	});

	t.pass('Successfully registered chaincode callbacks');
	try {
		eh.registerChaincodeEvent('ccid1', 'eventfilter', (block) => {
			t.fail('Should not have called success callback');
			t.end();
		}, (error) =>{
			t.fail('Should not have called error callback');
			t.end();
		}, 1);
		t.fail('Failed if the chaincode event with a replay is registered after another chaincode event');
	} catch(error) {
		if(error.toString().indexOf('Only one event registration is allowed')) {
			t.pass('Should not be able to register for more than one with replay')
		} else {
			t.fail('Should have gotten the only one event registration error ::'+error.toString());
		}
	}

	eh.unregisterChaincodeEvent(handle);

	try {
		eh.registerChaincodeEvent('ccid1', 'eventfilter', (block) => {
			t.fail('Should not have called success callback');
			t.end();
		}, (error) =>{
			t.fail('Should not have called error callback');
			t.end();
		}, 1);
		t.pass('Successfully registered a playback chaincode event');
	} catch(error) {
		t.fail( 'Failed - Should be able to register with replay')
	}

	t.equal(Object.keys(eh._chaincodeRegistrants).length, 1, 'Check the size of the _chaincodeRegistrants');

	t.end();
});


test('\n\n** ChannelEventHub block callback no Error callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	eh.registerBlockEvent((block) => {
		t.fail('Should not have called block no error success callback');
		t.end();
	});
	t.pass('successfully registered block callbacks');
	eh.disconnect();
	t.end();
});

test('\n\n** ChannelEventHub transaction callback no Error callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	eh.registerTxEvent('txid', (block) => {
		t.fail('Should not have called transaction no error success callback');
		t.end();
	});
	t.pass('successfully registered transaction callbacks');
	eh.disconnect();
	t.end();
});

test('\n\n** ChannelEventHub chaincode callback no Error callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	eh.registerChaincodeEvent('ccid', 'eventfilter', (block) => {
		t.fail('Should not have called chaincode no error success callback');
		t.end();
	});
	t.pass('successfully registered chaincode callbacks');
	eh.disconnect();
	t.end();
});

test('\n\n** ChannelEventHub remove block callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	var blockcallback = (block) => {
		t.fail('Should not have called block success callback (on remove)');
		t.end();
	};
	var blockerrorcallback = (error) =>{
		t.fail('Should not have called block error callback (on remove)');
		t.end();
	};
	var brn = eh.registerBlockEvent( blockcallback, blockerrorcallback);
	t.pass('successfully registered block callbacks');
	eh.unregisterBlockEvent(brn);
	t.equal(Object.keys(eh._blockOnEvents).length, 0, 'Check the size of the blockOnEvents hash table');
	t.pass('successfuly unregistered block callback');
	eh.disconnect();
	t.pass('successfuly disconnected ChannelEventHub');
	t.end();
});

test('\n\n** ChannelEventHub remove transaction callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	var txid = 'txid';
	eh.registerTxEvent(txid, (block) => {
		t.fail('Should not have called transaction success callback (on remove)');
		t.end();
	}, (error) =>{
		t.fail('Should not have called transaction error callback (on remove)');
		t.end();
	});
	t.pass('successfully registered transaction callbacks');
	eh.unregisterTxEvent(txid);
	t.pass('successfuly unregistered transaction callback');
	t.equal(Object.keys(eh._transactionOnEvents).length, 0, 'Check the size of the transactionOnEvents hash table');
	eh.disconnect();
	t.pass('successfuly disconnected ChannelEventHub');
	t.end();
});

test('\n\n** ChannelEventHub remove chaincode callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	var cbe = eh.registerChaincodeEvent('ccid', 'eventfilter', (block) => {
		t.fail('Should not have called chaincode success callback (on remove)');
		t.end();
	}, (error) =>{
		t.fail('Should not have called chaincode error callback (on remove)');
		t.end();
	});
	t.pass('successfully registered chaincode callbacks');
	eh.unregisterChaincodeEvent(cbe);
	t.pass('successfuly unregistered chaincode callback');
	t.equal(Object.keys(eh._chaincodeRegistrants).length, 0,
		'Size of the chaincodeRegistrants hash table should be 0');
	eh.disconnect();
	t.pass('successfuly disconnected ChannelEventHub');
	t.end();
});


test('\n\n** ChannelEventHub remove block callback no Error callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	var blockcallback = (block) => {
		t.fail('Should not have called block success callback (remove with no error callback)');
		t.end();
	};
	var brn = eh.registerBlockEvent( blockcallback);
	t.pass('successfully registered block callbacks');
	eh.unregisterBlockEvent(brn);
	t.pass('successfuly unregistered block callback');
	eh.disconnect();
	t.pass('successfuly disconnected ChannelEventHub');
	t.end();
});

test('\n\n** ChannelEventHub remove transaction callback no Error callback\n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;

	var txid = 'txid';
	eh.registerTxEvent(txid, (block) => {
		t.fail('Should not have called transaction success callback (remove with no error callback)');
		t.end();
	});
	t.pass('successfully registered transaction callbacks');
	eh.unregisterTxEvent(txid);
	t.pass('successfuly unregistered transaction callback');
	eh.disconnect();
	t.pass('successfuly disconnected ChannelEventHub');
	t.end();
});

test('\n\n** ChannelEventHub remove chaincode callback no Error callback \n\n', (t) => {
	let client = new Client();
	let peer = new Peer('grpc://127.0.0.1:7051');
	let channel = client.newChannel('mychannel');
	let eh = channel.newChannelEventHub(peer);

	eh._connected = true; //force this into connected state
	eh._force_reconnect = false;
	var cbe = eh.registerChaincodeEvent('ccid', 'eventfilter', (block) => {
		t.fail('Should not have called chaincode success callback (remove with no error callback)');
		t.end();
	});
	t.pass('successfully registered chaincode callbacks');
	eh.unregisterChaincodeEvent(cbe);
	t.pass('successfuly unregistered chaincode callback');
	eh.disconnect();
	t.pass('successfuly disconnected ChannelEventHub');
	t.end();
});

test('\n\n** Test the add and remove utilty used by the ChannelEventHub to add a setting to the options \n\n', (t) => {
	var only_options = sdkUtils.checkAndAddConfigSetting('opt1', 'default1', null);
	t.equals(only_options['opt1'], 'default1', 'Checking that new options has the setting with the incoming value and options are null');

	var options = { opt1 : 'incoming1', opt4 : 'incoming4'};

	// case where incoming options does have the setting
	var updated_options = sdkUtils.checkAndAddConfigSetting('opt1', 'default1', options);
	// case where incoming options does not have setting and config does not
	updated_options = sdkUtils.checkAndAddConfigSetting('opt2', 'default2', updated_options);
	// case where incoming options does not have setting and config does
	sdkUtils.setConfigSetting('opt3', 'config3');
	updated_options = sdkUtils.checkAndAddConfigSetting('opt3', 'default3', updated_options);

	// case where incoming options does not have setting and config does have
	t.equals(updated_options['opt1'], 'incoming1', 'Checking that new options has the setting with the incoming value');
	t.equals(updated_options['opt2'], 'default2', 'Checking that new options has the setting with the default value');
	t.equals(updated_options['opt3'], 'config3', 'Checking that new options has the setting with the value from the config');
	t.equals(updated_options['opt4'], 'incoming4', 'Checking that new options has setting not looked at');

	t.end();
});

// test actions after connect fails
// 1. register for event with no delay and no error callback
// 2. register for event with no delay and error callback
// 3. register for event with delay and no error callback
// 4. register for event with delay and error callback
test('\n\n** ChannelEventHub test actions when connect failures on transaction registration \n\n', (t) => {
	var client = new Client();
	var channel = client.newChannel('mychannel');
	let peer = new Peer('grpc://127.0.0.1:7051');
	var event_hub = null;
	var member = new User('user1');
	var crypto_suite = utils.newCryptoSuite();
	crypto_suite.setCryptoKeyStore(utils.newCryptoKeyStore());
	member.setCryptoSuite(crypto_suite);
	crypto_suite.generateKey()
	.then(function (key) {
		return member.setEnrollment(key, test_user.TEST_CERT_PEM, 'DEFAULT');
	}).then(() => {
		var id = member.getIdentity();
		client.setUserContext(member, true);

		// tx test 1
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();
		t.doesNotThrow(
			() => {
				event_hub.registerTxEvent('123', (tx_id, code) => {
					t.fail('Failed callback should not have been called - tx test 1')
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - tx test 1'
		);

		// tx test 2
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();
		t.doesNotThrow(
			() => {
				event_hub.registerTxEvent('123',
				(tx_id, code) => {
					t.fail('Failed callback should not have been called - tx test 2')
				},
				(error) =>{
					if(error.toString().indexOf('Connect Failed')) {
						t.pass('Successfully got the error call back tx test 2 ::'+error);
					} else {
						t.failed('Failed to get connection failed error tx test 2 ::'+error);
					}
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - tx test 2'
		);

		// tx test 3
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();

		let sleep_time = 3000;
		t.comment('about to sleep '+sleep_time);
		return sleep(sleep_time);
	}).then((nothing) => {
		t.pass('Sleep complete');
		// eventhub is now actually not connected

		t.throws(
			() => {
				event_hub.registerTxEvent('123', (tx_id, code) => {
					t.fail('Failed callback should not have been called - tx test 3')
				});
			},
			/The event hub has not been connected to the event source/,
			'Check for The event hub has not been connected to the event source - tx test 3'
		);

		// test 4
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();

		let sleep_time = 3000;
		t.comment('about to sleep '+sleep_time);
		return sleep(sleep_time);
	}).then((nothing) => {
		t.pass('Sleep complete');
		// eventhub is now actually not connected

		t.doesNotThrow(
			() => {
				event_hub.registerTxEvent('123',
				(tx_id, code) => {
					t.fail('Failed callback should not have been called - tx test 4')
				},
				(error) =>{
					if(error.toString().indexOf('Connect Failed')) {
						t.pass('Successfully got the error call back tx test 4 ::'+error);
					} else {
						t.failed('Failed to get connection failed error tx test 4 :: '+error);
					}
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - tx test 4'
		);

		t.end();
	}).catch((err) => {
		t.fail(err.stack ? err.stack : err);
		t.end();
	});

});

// test actions after connect fails
// 1. register for event with no delay and no error callback
// 2. register for event with no delay and error callback
// 3. register for event with delay and no error callback
// 4. register for event with delay and error callback
test('\n\n** EventHub test actions when connect failures on block registration \n\n', (t) => {
	var client = new Client();
	var channel = client.newChannel('mychannel');
	let peer = new Peer('grpc://127.0.0.1:7051');
	var event_hub = null;
	var member = new User('user1');
	var crypto_suite = utils.newCryptoSuite();
	crypto_suite.setCryptoKeyStore(utils.newCryptoKeyStore());
	member.setCryptoSuite(crypto_suite);
	crypto_suite.generateKey()
	.then(function (key) {
		return member.setEnrollment(key, test_user.TEST_CERT_PEM, 'DEFAULT');
	}).then(() => {
		var id = member.getIdentity();
		client.setUserContext(member, true);

		// test 1
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();
		t.doesNotThrow(
			() => {
				event_hub.registerBlockEvent((tx_id, code) => {
					t.fail('Failed callback should not have been called - block test 1')
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - block test 1'
		);

		// block test 2
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();
		t.doesNotThrow(
			() => {
				event_hub.registerBlockEvent(
				(tx_id, code) => {
					t.fail('Failed callback should not have been called - block test 2')
				},
				(error) =>{
					if(error.toString().indexOf('Connect Failed')) {
						t.pass('Successfully got the error call back block test 2 ::'+error);
					} else {
						t.failed('Failed to get connection failed error block test 2 ::'+error);
					}
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - block test 2'
		);

		// block test 3
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();

		let sleep_time = 3000;
		t.comment('about to sleep '+sleep_time);
		return sleep(sleep_time);
	}).then((nothing) => {
		t.pass('Sleep complete');
		// eventhub is now actually not connected

		t.throws(
			() => {
				event_hub.registerBlockEvent((tx_id, code) => {
					t.fail('Failed callback should not have been called - block test 3')
				});
			},
			/The event hub has not been connected to the event source/,
			'Check for The event hub has not been connected to the event source - block test 3'
		);

		// block test 4
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();

		let sleep_time = 3000;
		t.comment('about to sleep '+sleep_time);
		return sleep(sleep_time);
	}).then((nothing) => {
		t.pass('Sleep complete');
		// eventhub is now actually not connected

		t.doesNotThrow(
			() => {
				event_hub.registerBlockEvent(
				(tx_id, code) => {
					t.fail('Failed callback should not have been called - block test 4')
				},
				(error) =>{
					if(error.toString().indexOf('Connect Failed')) {
						t.pass('Successfully got the error call back block test 4 ::'+error);
					} else {
						t.failed('Failed to get connection failed error block test 4 :: '+error);
					}
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - block test 4'
		);

		t.end();
	}).catch((err) => {
		t.fail(err.stack ? err.stack : err);
		t.end();
	});

});

// chaincode test actions after connect fails
// 1. register for event with no delay and no error callback
// 2. register for event with no delay and error callback
// 3. register for event with delay and no error callback
// 4. register for event with delay and error callback
test('\n\n** EventHub test actions when connect failures on chaincode registration \n\n', (t) => {
	var client = new Client();
	var channel = client.newChannel('mychannel');
	let peer = new Peer('grpc://127.0.0.1:9999');
	var event_hub = null;
	var member = new User('user1');
	var crypto_suite = utils.newCryptoSuite();
	crypto_suite.setCryptoKeyStore(utils.newCryptoKeyStore());
	member.setCryptoSuite(crypto_suite);
	crypto_suite.generateKey()
	.then(function (key) {
		return member.setEnrollment(key, test_user.TEST_CERT_PEM, 'DEFAULT');
	}).then(() => {
		var id = member.getIdentity();
		client.setUserContext(member, true);

		// chaincode test 1
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();
		t.doesNotThrow(
			() => {
				event_hub.registerChaincodeEvent('123', 'event', (tx_id, code) => {
					t.fail('Failed callback should not have been called - chaincode test 1')
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - chaincode test 1'
		);

		// chaincode test 2
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();
		t.doesNotThrow(
			() => {
				event_hub.registerChaincodeEvent('123', 'event',
				(tx_id, code) => {
					t.fail('Failed callback should not have been called - chaincode test 2')
				},
				(error) =>{
					if(error.toString().indexOf('Connect Failed')) {
						t.pass('Successfully got the error call back chaincode test 2 ::'+error);
					} else {
						t.failed('Failed to get connection failed error chaincode test 2 ::'+error);
					}
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - chaincode test 2'
		);

		// chaincode test 3
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();

		let sleep_time = 3000;
		t.comment('about to sleep '+sleep_time);
		return sleep(sleep_time);
	}).then((nothing) => {
		t.pass('Sleep complete');
		// eventhub is now actually not connected

		t.throws(
			() => {
				event_hub.registerChaincodeEvent('123', 'event', (tx_id, code) => {
					t.fail('Failed callback should not have been called - chaincode test 3')
				});
			},
			/The event hub has not been connected to the event source/,
			'Check for The event hub has not been connected to the event source - chaincode test 3'
		);

		// chaincode test 4
		event_hub = channel.newChannelEventHub(peer);
		event_hub.connect();

		let sleep_time = 3000;
		t.comment('about to sleep '+sleep_time);
		return sleep(sleep_time);
	}).then((nothing) => {
		t.pass('Sleep complete');
		// eventhub is now actually not connected

		t.doesNotThrow(
			() => {
				event_hub.registerChaincodeEvent('123', 'event',
				(tx_id, code) => {
					t.fail('Failed callback should not have been called - chaincode test 4')
				},
				(error) =>{
					if(error.toString().indexOf('Connect Failed')) {
						t.pass('Successfully got the error call back chaincode test 4 ::'+error);
					} else {
						t.failed('Failed to get connection failed error chaincode test 4 :: '+error);
					}
				});
			},
			null,
			'Check for The event hub has not been connected to the event source - chaincode test 4'
		);

		t.end();
	}).catch((err) => {
		t.fail(err.stack ? err.stack : err);
		t.end();
	});

});

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
