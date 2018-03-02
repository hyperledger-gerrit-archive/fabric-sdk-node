
This tutorial illustrates the use of adding metadata to your chaincode install.
As of v1.1 the only metadata are the indexes that may be added to a CouchDB state
database of your channel ledger.

For more information on:
* getting started with Hyperledger Fabric
[see](http://hyperledger-fabric.readthedocs.io/en/latest/build_network.html)
* the configuration of a channel in Hyperledger Fabric and the internal
process of creating and updating
[see](http://hyperledger-fabric.readthedocs.io/en/latest/configtx.html)
* setting up a CouchDB as the state database
[see](http://hyperledger-fabric.readthedocs.io/en/latest/couchdb_as_state_database.html?highlight=couchdb)

The following assumes an understanding of the Hyperledger Fabric network
(orderers and peers),
and of Node application development, including the use of the
Javascript `Promise`.

### Overview
Fabric 1.1 has introduced the capability of defining indexes in a CouchDB state database to help improve performance of your queries made in your chaincode. The index definitions need to in Json format and in files with a .json extension. These definitions must be packaged up with the chaincode installation package. The Fabric peer where the package will installed  the indexes in the CouchDB at the time of chaincode instantiation (or during chaincode installation if the chaincode is already instantiated).

#### Modified API's that allow for metadata
* `client.installChaincode()` - There is a new attribute ('metadataPath') that may be included in the installation request. To include the index definitions in the chaincode installation package, point the metadata path to the directory containing the json files by including a  `metadataPath` in install request.

### Installing chaincode
The following example will install the chaincode 'my_chaincode'.
```
let targets = //build the list of peers that will require this chaincode
let chaincode_path = path.resolve(__dirname, '../fixtures/src/node_cc/my_chaincode');
let metadata_path = path.resolve(__dirname, '../fixtures/metadata');

// send proposal to install
var request = {
	targets: targets,
	chaincodePath: chaincode_path,
	metadataPath: metadata_path, // notice this is the new attribute of the request
	chaincodeId: 'my_chaincode',
	chaincodeType: 'node',
	chaincodeVersion: 'v1'
};

client.installChaincode(request).then((results) => {
	var proposalResponses = results[0];
	// check the results
}, (err) => {
	console.log('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
	throw new Error('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
});
```
The following shows the directory structure used above and shows the required
under directories went defining indexes on your CouchDB.
```
 ...
  <> fixtures
  │
  └─── <> metadata // here is where the 'metadataPath' will point to
       │
       └─── <> statedb //starting here are the required directories
            │
            └─── <> couchdb
                 │
                 └─── <> indexes
                         index.json // these will be the index files and must
                                    // have the file extension of json
```
The `index.json` file must contain a valid json string like the following
```
{"index":{"fields":["docType","owner"]},"ddoc":"indexOwnerDoc", "name":"indexOwner","type":"json"}
```
<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.
