
This tutorial illustrates a Hyperledger Fabric channel update using the Node.js fabric-client SDK.

For more information on:
* getting started with Hyperledger Fabric see [Hyperledger Fabric documentation](http://hyperledger-fabric.readthedocs.io/en/latest/getting_started.html).
* the configuration of Hyperledger Fabric channel and the internal process of creating and updating see [Hyperledger Fabric channel configuration](http://hyperledger-fabric.readthedocs.io/en/latest/configtx.html)
* cryptographic generation see [cryptogen](http://hyperledger-fabric.readthedocs.io/en/latest/getting_started.html#crypto-generator)
* Configuration Translation Tool see [configtxlator](https://github.com/jyellick/fabric-gerrit/tree/configtxlator/examples/configtxupdate)

The following assumes an understanding of the Hyperledger Fabric network (orderers and peers) and of Node application development, including the use of the Javascript `Promise`.

### steps of a channel update:
* Get the current configuration of the channel by using the fabric-client SDK API
* Using the `configtxlator`, decode the original `common.Config` into JSON
* Edit the JSON with the necessary changes
* Using the `configtxlator`, encode the updated JSON config and save the returned `common.Config`
* Using the `configtxlator`, compute a `common.ConfigUpdate` update object
* Using the fabric-client SDK, sign the computed config update object by all organizations
* Using the fabric-client SDK, update the channel by using the `updateChannel()` API with all the signatures and the computed config update object

## Get the current configuration

Use the fabric-client SDK to retrieve the current configuration binary from the Orderer. This will be used in a few of the steps in the update process. First will be to have the current configuration binary translated into human readable JSON. This will allow for easier editing of changes.
<pre>
// get a channel object to represent the channel to be updated
var channel = client.newChannel(channel_name);

// create an orderer object to represent the orderer of the network
var orderer = client.newOrderer(url,opts);
// assign orderer to this channel
channel.addOrderer(orderer);

channel.getChannelConfig().then((config_envelope) => {
    original_config = config_envelope.getConfig();
  }).catch((err) => {
    // failed to get the config
  });
</pre>
Save the binary results of the `getChannelConfig` Promise, it will be needed later.

Send the binary results to the `configtxlator` to get the JSON represention of the configuration. In the following example we are using the Node package "superagent" and "superagent-promise", this makes it easy to send HTTP requests in a Node.js Promise flow.

```
agent.post('http://127.0.0.1:7059/protolator/decode/common.Config',
			original_config)
			.buffer().then((results) =>{
        json_config = results.text.toString();
      }).catch((err)=>{
        // failed to get the JSON
      });
```
Edit the results of the the `configtxlator` to include the changes required on the channel.

## Building a custom sign-able channel update

Once JSON configuration has been updated, it may be sent to the `configtxlator` service to get an updated `common.Config` binary configuration objet.
```
agent.post('http://127.0.0.1:7059/protolator/encode/common.Config',
			updated_config_json.toString())
			.buffer().then((results) =>{
        updated_config = results.body;
      }).catch((err) =>{
        // failed to get updated config
      });
```
The `configtxlator` can then be sent the orginal configuration and the updated configuration binaries to compute the configuration update binary needed for signing and the channel update operation.
```
var formData = {
  channel: channel_name,
  original: {
    value: original_config_proto,
    options: {
      filename: 'original.proto',
      contentType: 'application/octet-stream'
    }
  },
  updated: {
    value: updated_config_proto,
    options: {
      filename: 'updated.proto',
      contentType: 'application/octet-stream'
    }
  }
};

return new Promise((resolve, reject) =>{
  requester.post({
    url: 'http://127.0.0.1:7059/configtxlator/compute/update-from-configs',
    formData: formData
  }, function optionalCallback(err, res, body) {
    if (err) {
      //Failed to get the updated configuration
      reject(err);
    } else {
      var config_update = new Buffer(body, 'binary');
      resolve(config_update);
    }
  });
});
```
The binary config_update may now be used in the signing process and sent to the orderer for channel creation.

## Signin and submitting the channel update

The binary configuration must be signed by all organizations. The application will have to store the binary configuration and have it available to be signed along with storing all the signatures as it collects them. Then once the signing is complete, the application will send the binary configuration and all the signatures to the orderer using the `fabric-client` Node.js SDK API `updateChannel()`.

First the signing, assuming the `client` SDK object has a valid user in a required organization
```
var signature = client.signChannelConfig(config_update);
signatures.push(signature);
```
Now it is time for the channel update, assuming that the `signatures` object is an array of `common.ConfigSignature` returned by the `client.signChannelConfig()` method.
```
// create an orderer object to represent the orderer of the network
var orderer = client.newOrderer(url,opts);

// have the SDK generate a transaction id
let tx_id = client.newTransactionID();

request = {
  config: config_proto, //the binary config
  signatures : signatures, // the collected signatures
  name : 'mychannel', // the channel name
  orderer : orderer, //the orderer from above
  txId  : tx_id //the generated transaction id
};

// this call will return a Promise
client.updateChannel(request)
```
The `updateChannel` API returns a `Promise` to return the status of the submit. The channel update will take place asynchronously by the orderer.

After a small delay of a few seconds the channel will have been updated by the orderer.

<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.
