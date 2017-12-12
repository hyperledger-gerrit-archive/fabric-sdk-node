
This tutorial illustrates the use of a channel based events, These events are similar to the existing events, however are specific to a specific channel. The events are new feature of the Hyperledger Fabric Node.js client as of 1.1.

For more information on:
* getting started with Hyperledger Fabric see
[Building your first network](http://hyperledger-fabric.readthedocs.io/en/latest/build_network.html).

The following assumes an understanding of the Hyperledger Fabric network
(orderers and peers),
and of Node application development, including the use of the
Javascript `Promise`.

### Overview
Channel based events occur when there is a new block added to the channel ledger. A client application may use the Fabric Node.js client to register a listener to receive new blocks as they are added to the channel ledger. The Fabric Node.js client will also assist client applications by processing the incoming blocks looking for specific transactions or chaincode events. This assistance allows a client application to register a listener with the Fabric Node.js client to be notified when a transaction or chaincode event completes and is committed to the ledger. This will avoid the client application from having to dig through the blocks or poll (multiple queries) the ledger when waiting for completion of a transaction or chaincode event.

### new API on the Channel
* `newChannelEventHub(peer)` - A Channel instance method to get a new instance of a ChannelEventHub.

### new class ChannelEventHub and new APIs
* `registerBlockEvent(eventCallBack, errorCallBack, start_block)` - To register for block events.
* `unregisterBlockEvent(reg_num)` - To remove a block registration.
* `registerTxEvent(tx_id, eventCallBack, errorCallBack, start_block)` - To register for specific transaction event.
* `unregisterTxEvent(tx_id)` - To remove a specific transaction registration.
* `registerChaincodeEvent(ccid, eventCallBack, errorCallBack, start_block)` - To register for chaincode events.
* `unregisterChaincodeEvent(cc_handle)` - To remove a chaincode event registration.
* `connect()` - To have the client channel event hub connect with the fabric network channel base event service.
* `disconnect()` - To have the client channel event hub shutdown the connection to the fabric newwork channel based event service and notify all current channel event registrations that the shutdown with the errorCallBack.

##### `peer` parameter
This parameter must be included when getting a new instance of the ChannelEventHub. The value may be a `Peer` instance or the name of a peer when using a `connection profile` see [How to use a common network configuration file](tutorial-network-config.html).

##### `eventCallback` parameter
This parameter must be included. This is the callback function to be notified when this channel receives a new block or when listening for specific transactions or chaincode events.

##### `errorCallback` parameter
This is an optional parameter. This is the callback function to be notified when this channel event hub is shutdown. The shutdown may be caused by a network error or by a call to the "disconnect()" method or a connection error.

##### `start_block` parameter
This is an optional parameter. The will be the starting block number for event checking. When included the event service will be ask to start sending blocks from this block. This would be how to resume and replay missed blocks that were added to the ledger. Since replaying events may confuse other event listeners, only one listener will be allowed on a ChannelEventHub when a start_block is included.

### Work with a Channel Event Hub
 When there is need to monitor for specific events that will be created by your chaincode use a chaincode listener. When there is a need to monitor for specific transaction completion then user a transaction listener.

### Get a Channel Event Hub
A new method has been added to the fabric channel object to simplify setting up of an ChannelEventHub object. Use the following to get an ChannelEventHub instance that will be setup to work with the named peer's event service. The ChannelEventHub instance will use all the same endpoint configuration setting that the peer instance is using, like the tls certs and host and port address.

call by peer name
```
var channelEventHub = channel.getChannelEventHub('peer0.org1.example.com');
```

call by peer instance
```
let data = fs.readFileSync(path.join(__dirname, 'e2e', '../../fixtures/channel/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tlscacerts/org1.example.com-cert.pem'));
let peer = client.newPeer(
	'grpcs://localhost:7051',
	{
		pem: Buffer.from(data).toString(),
		'ssl-target-name-override': 'peer0.org1.example.com'
	}
);
let channelEventHub = channel.newChannelEventHub(peer);
channelEventHub.connect(); //could wait,
```
### Block Listener
When there is a need to monitor for new blocks being added to the channel ledger, use a block event listener. The fabric client Node.js will be notified when a new block is committed to the ledger on the fabric peer. The fabric client Node.js will then call the registered callback of the application program. The callback will include a JSON representation of the newly added block. When there is a need to see previously added blocks, the registration of the callback may include a starting block number. The callback will start receiving blocks from this number and continue to receive new blocks as they are added to the ledger. This is a way for the application to resume and replay events that may have been lost if the application were to be offline. The application should remember the last block it has processed to avoid replaying the entire ledger.

The following example will register to start receiving block.
```
// keep the block_reg to unregister with later if needed
block_reg = channelEventHub.registerBlockEvent((block) => {
	console.log('Successfully received the block event');
	<do something with the block>
}, (error)=> {
	console.log('Failed to receive the block event ::'+error);
	<do something with the error>
});
```

The following example will register with a start block number because this application needs to resume at specific block and replay the blocks so the callback will handle them like current events. The listener registered here will continue to receive blocks as they are committed to the ledger on the fabric peer.
```
// keep the block_reg to unregister with later if needed
block_reg = channelEventHub.registerBlockEvent((block) => {
	console.log('Successfully received the block event');
	<do something with the block>
}, (error)=> {
	console.log('Failed to receive the block event ::'+error);
	<do something with the error>
},
	resume_point
);
```

### Transaction listener
When there is a need to monitor for the completion of a transaction on your organizations peer, use a trasaction listener. The fabric client Node.js will be notified when a new block is committed to the ledger on the fabric peer. The fabric client Node.js will then check the block for registered transaction identifiers. If a transaction is found then the callback will be notified with the transaction ID, the transaction status, and the block number.

The following example will show registering a transaction ID within a javascript promise and building another promise for the sending the transaction to the orderer. Both promises will be executed together so that results will be received for both actions together.

```
let tx_object = client.newTransactionID();
let tx_id = tx_object.getTransactionID();
let request = {
	targets : targets,
	chaincodeId: 'my_chaincode',
	fcn: 'invoke',
	args: ['doSomething', 'with this data'],
	txId: tx_object
};

return channel.sendTransactionProposal(request);
}).then((results) => {
// a real application would check the proposal results
console.log('Successfully endorsed proposal to invoke chaincode');

// start block may be null if there is no need to resume
let start_block = getBlockFromSomewhere();

let event_monitor = new Promise((resolve, reject) => {
	let handle = setTimeout(() => {
		channelEventHub.unregisterTxEvent(tx_id);
		console.log('Timeout - Failed to receive the transaction event');
		reject(new Error('Timed out waiting for block event'));
	}, 20000);

	channelEventHub.registerTxEvent((event_tx_id, status, block_num) => {
		clearTimeout(handle);
		channelEventHub.unregisterTxEvent(event_tx_id);
		console.log('Successfully received the transaction event');
		storeBlockNumForLater(block_num);
		resolve(status);
	}, (error)=> {
		clearTimeout(handle);
		channelEventHub.unregisterTxEvent(tx_id);
		console.log('Failed to receive the transaction event ::'+error);
		reject(error);
	},
		start_block // when this value is null (the normal case) transactions
		            // will start with the latest
	);
});
let send_trans = channel.sendTransaction({proposalResponses: results[0], proposal: results[1]});

return Promise.all([event_monitor, send_trans]);
}).then((results) => {
```

### Chaincode event listener
When there is a need to monitor for events that will be posted from within your chaincode, use a chaincode event listener. The fabric client Node.js will be notified when a new block is committed to the ledger on the fabric peer. The fabric client Node.js will then check for registered chaincode patterns within the chaincode events of the block. If a chaincode event is found then the callback will be notified with the chaincode event objectand the block number.

The following example will show registering a chaincode event listener within a javascript promise and building another promise for the sending the transaction to the orderer. Both promises will be executed together so that results will be received for both actions together. If a chaincode event listener is needed for long term monitoring,  follow the block listener above.

```
let tx_object = client.newTransactionID();
let request = {
	targets : targets,
	chaincodeId: 'my_chaincode',
	fcn: 'invoke',
	args: ['doSomething', 'with this data'],
	txId: tx_object
};

return channel.sendTransactionProposal(request);
}).then((results) => {
// a real application would check the proposal results
console.log('Successfully endorsed proposal to invoke chaincode');

let event_monitor = new Promise((resolve, reject) => {
	let regid = null;
	let handle = setTimeout(() => {
		if (regid) {
			channelEventHub.unregisterChaincodeEvent(regid);
			console.log('Timeout - Failed to receive the chaincode event');
		}
		reject(new Error('Timed out waiting for chaincode event'));
	}, 20000);

	regid = channelEventHub.registerChaincodeEvent(chaincode_id.toString(), '^evtsender*',
		(event) => {
		clearTimeout(handle);
		channelEventHub.unregisterChaincodeEvent(regid);
		console.log('Successfully received the chaincode event');
		storeBlockNumForLater(block_num);
		resolve();
	}, (error)=> {
		clearTimeout(handle);
		channelEventHub.unregisterChaincodeEvent(regid);
		console.log('Failed to receive the chaincode event ::'+error);
		reject(error);
	});
});
let send_trans = channel.sendTransaction({proposalResponses: results[0], proposal: results[1]});

return Promise.all([event_monitor, send_trans]);
}).then((results) => {
```


<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.
