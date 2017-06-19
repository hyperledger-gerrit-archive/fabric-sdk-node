
This tutorial illustrates a Hyperledger Fabric channel create using the Node.js fabric-client SDK. The process to create a channel does involve a number of tasks that are not Node.js related and will only be briefly discussed.

For more information on:
* getting started with Hyperledger Fabric see [Hyperledger Fabric documentation](http://hyperledger-fabric.readthedocs.io/en/latest/getting_started.html).
* the configuration of Hyperledger Fabric channel and the internal process of creating and updating see [Hyperledger Fabric channel configuration](http://hyperledger-fabric.readthedocs.io/en/latest/configtx.html)
* cryptographic generation see [cryptogen](http://hyperledger-fabric.readthedocs.io/en/latest/getting_started.html#crypto-generator)
* Configuration Transaction Generator see [configtxgen](http://hyperledger-fabric.readthedocs.io/en/latest/getting_started.html#configuration-transaction-generator)
* Configuration Translation Tool see [configtxlator](https://github.com/jyellick/fabric-gerrit/tree/configtxlator/examples/configtxupdate)

The following assumes an understanding of the Hyperledger Fabric network (orderers and peers) and of Node application development, including the use of the Javascript `Promise`.

### steps of a channel create:
  * network administrator runs the cryptogen tool
  * network administrator edits the YAML configuration file
  * network administrator runs the configtxgen tool to generate a genesis block
  * network administrator starts the orderer with the generated genesis block
  * network administrator runs the configtxgen tool to generate a binary channel config
  * organization administrator gets a sign-able binary config update from the binary channel config in one of two ways
    1. use configtxgen only
      * uses the fabric-client SDK to extract the binary config update from the binary channel config
    2. use configtxgen and configtxlator
      * uses configtxlator to convert binary channel config to a readable form
      * edits the readable [more info](http://hyperledger-fabric.readthedocs.io/en/latest/configtx.html)
      * uses configtxlator to convert to a binary config update
  * organization administrator(s) use the fabric-client SDK to sign the binary config update
  * organization administrator uses the fabric-client SDK to send the signatures and the binary config update to the orderer
  * organization administrator uses the fabric-client SDK to have the peer join the channel
  * new channel may now be used

## Creating a custom sign-able channel update

 The easiest way to get started with creating a new channel configuration JSON is to have the configtxlator convert an existing binary used to create a new channel to human readable JSON. There are many elements of the configuration and it would be very difficult to start with nothing. Using the same configtx.yaml file used to generate your Hyperledger Fabric network, use the configtxgen tool to create a binary for a new channel for your network. Then by sending that binary to the configtxlator to convert it to JSON, you will be able to see the layout and have a starting point to create a new channel. That JSON could also be used as a template for creating other new channels on your network. A new channel will inherit settings from the system channel for any settings not defined in the new channel configuration. Organizations that will be on the new channel must be defined in a consortium on the system channel. Therefore having the JSON configuration of the system channel of your network would be helpful when creating a new channel. Again use the configtxgen tool to generate the system channel configuration and send it to the configtxlator to get a JSON file to be used as a reference.

The following examples are with the `configtx.yaml` in the `sampleconfig` directory of Hyperledger Fabric.

Get the binary config files produced by the configtxgen tool.
<pre>
build/bin/configtxgen -outputBlock genesis.block -profile SampleSingleMSPSolo
build/bin/configtxgen -channelID mychannel -outputCreateChannelTx mychannel.tx -profile SampleSingleMSPChannel
</pre>
Send the two binary files to the configtxlator service. Since this step is done only once and does not require a Node.js application, we will use cURL to simplify and speed up getting the results. Notice that configtxlator service path has `decode` (convert from binary to JSON). The path must also include the type of object of the binary, in the first case, it is a `common.Block`. The "decode" or "encode" may be done for any of the protobuf `message` object types found in the `fabric-client\lib\protos` directory protobuf files.
```
curl -X POST --data-binary @genesis.block http://127.0.0.1:7059/protolator/decode/common.Block > genesis.json
curl -X POST --data-binary @mychannel.tx http://127.0.0.1:7059/protolator/decode/common.Envelope > mychannel.json
```
The results of decoding the file `mychannel.tx` which is a `common.Evelope` produced by the configtxgen tool contains a `common.ConfigUpdate` object. This object has the name "config_update" within the "payload.data" JSON object. This is the object that is needed as the source of the template to be used for creating new channels. The `common.ConfigUpdate` is the object that will be signed by all organizations and submitted to the orderer to create a new channel. You may ask why is a `common.ConfigUpdate` used for a create. This makes the process of create and update the same. The create of a new channel is a delta on what is defined in the system channel and an update is a delta on what is defined in the channel. The `common.ConfigUpdate` object submitted will only contain the changes for both a create and an update.

The following is the extracted JSON "config_update" (`common.ConfigUpdate`) object from the decode of the "SampleSingleMSPChannel" channel create binary generated above.
```
{
  "channel_id": "mychannel",
  "read_set": {
    "groups": {
      "Application": {
        "groups": {
          "SampleOrg": {}
        }
      }
    },
    "values": {
      "Consortium": {
        "value": {
          "name": "SampleConsortium"
        }
      }
    }
  },
  "write_set": {
    "groups": {
      "Application": {
        "groups": {
          "SampleOrg": {}
        },
        "mod_policy": "Admins",
        "policies": {
          "Admins": {
            "policy": {
              "type": 3,
              "value": {
                "rule": "MAJORITY",
                "sub_policy": "Admins"
              }
            }
          },
          "Readers": {
            "policy": {
              "type": 3,
              "value": {
                "sub_policy": "Readers"
              }
            }
          },
          "Writers": {
            "policy": {
              "type": 3,
              "value": {
                "sub_policy": "Writers"
              }
            }
          }
        },
        "version": "1"
      }
    },
    "values": {
      "Consortium": {
        "value": {
          "name": "SampleConsortium"
        }
      }
    }
  }
}
```
Note that the `Consortium` name used must exist on the system channel. All organizations that you wish to add to the new channel must be defined under in the `Consortium` section with that name on the system channel. Use the decoded genesis block to verify all values, for example by looking in the `genesis.json` file generated above. To add an organizations to the channel, they must be placed under the `groups` section under the `Applications` section as shown above. See that `SampleOrg` is a property of `Applications.groups` section. In this example all of the settings for the organization `SampleOrg` will be inherited from the system channel (notice the empty object "{}" for this organization's properties). To see the current settings for this organization look within the `SampleConsortium` section under the `Consortium` section of the system channel (the genesis block of the system channel).

Once you have a JSON configuration representing your channel, send it the `configtxlator` to be encoded into a configuration binary. The following example of sending a REST request to the `configtxlator` uses the Node.js package `superagent` because of the ease of use for HTTP requests.
```
var response = superagent.post('http://127.0.0.1:7059/protolator/encode/common.ConfigUpdate',
  config_json.toString())
  .buffer()
  .end((err, res) => {
    if(err) {
      logger.error(err);
      return;
    }
    config_proto = res.body;
  });
```

## Using configtxgen to generate a sign-able channel update

The binary channel configuration file produced by the configtxgen tool is a Hyperledger Fabric configuration `common.Envelope` element. Inside this element is the `common.ConfigUpdate` element that is the configuration element that requires the signatures. The source definition of this configuration binary is a profile element of a `configtx.yaml`.
```
build/bin/configtxgen -channelID mychannel -outputCreateChannelTx mychannel.tx -profile SampleSingleMSPChannel
```
Have the fabric-client SDK extract the config update element from the mychannel.tx file
```
// first read in the file, this gives us a binary config envelope
let envelope_bytes = fs.readFileSync(path.join(__dirname, '../../fixtures/channel/mychannel.tx'));
// have the nodeSDK extract out the config update
var config_update = client.extractChannelConfig(envelope_bytes);
```
The binary config_update may now be used in the signing process and sent to the orderer for channel creation.

## Signin and submitting the channel update

The binary configuration must be signed by all organizations. The application will have to store the binary configuration and have it available to be signed along with storing all the signatures as it collects them. Then once the signing is complete, the application will send the binary configuration and all the signatures to the orderer using the fabric-client SDK API `createChannel()`.

First the signing, assuming the `client` fabric-client SDK object has a valid user in a required organization
```
var signature = client.signChannelConfig(config_proto);
signatures.push(signature);
```
Now it is time for the channel create, assuming that the `signatures` object is an array of `common.ConfigSignature` returned by the `client.signChannelConfig()` method.
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
client.createChannel(request)
```
The `createChannel` API returns a `Promise` to return the status of the submit. The channel create will take place asynchronously by the orderer.

After a small delay of a few seconds the channel will have been created by the orderer and may now be joined by the peers. Issue the following to the peers that are required on the channel. This is a two step process of first getting the genesis block of the channel and then sending it to the peer. In the following example the genesis block was retrieved from the orderer, but could have also been loaded from a file.
```
// set the channel up with network endpoints
var orderer  = client.newOrderer(orderer_url,orderer_opts);
channel.addOrderer(orderer);
var peer = client.newPeer(peer_url,peer_opts);
channel.addPeer(peer);

tx_id = client.newTransactionID();
let g_request = {
  txId : 	tx_id
};

// get the genesis block from the orderer
channel.getGenesisBlock(g_request).then((block) =>{
  genesis_block = block;
  tx_id = client.newTransactionID();
  let j_request = {
    targets : targets,
    block : genesis_block,
    txId : 	tx_id
  };

  // send genesis block to the peer
  return channel.joinChannel(j_request);
}).then((results) =>{
  if(results && results.response && results.response.status == 200) {
    // join successful
  } else {
    // not good
  }
});
```



<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.
