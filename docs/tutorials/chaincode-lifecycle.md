This tutorial describes how to use your application to install a chaincode on
your peers and define it on a channel. This tutorial uses the Fabric chaincode
lifecycle introduced in the Fabric V2.0 Alpha and the fabric-client 2.0. The
api's for using the previous chaincode lifecycle will still be available in
fabric-client, but will not be discussed in this tutorial.

For more information on the new Fabric Chaincode lifecycle, visit the
[Chaincode for Operators tutorial](https://hyperledger-fabric.readthedocs.io/en/latest/chaincode4noah.html) in the Hyperledger Fabric documentation.

For more information on:
* getting started with Hyperledger Fabric see
[Building your first network](http://hyperledger-fabric.readthedocs.io/en/latest/build_network.html).
* the configuration of a channel in Hyperledger Fabric and the internal
process of creating and updating a channel, see
[Hyperledger Fabric channel configuration](http://hyperledger-fabric.readthedocs.io/en/latest/configtx.html)

The following tutorial assumes an understanding of the components of a
Hyperledger Fabric network (orderers and peers) and of Node application
development, including the use of the Javascript `promise` and `async await`.

### Overview

The Fabric 2.0 Alpha introduces decentralized governance for chaincode. The new
Fabric chaincode lifecycle allows multiple organizations to come to agreement
on the parameters of a chaincode, such as the chaincode endorsement policy,
before it can be used to interact with the ledger. You will need to enable the
new Fabric chaincode lifecycle on your network by setting the channel
capabilities to `V2_0` to use the steps in this tutorial.

Channel members need to complete the following steps before they can start
using a chaincode:
* `Setup`- create the necessary application objects
* `Package` - create a chaincode package from your source code
* `Install` - install the chaincode package on your peers
* `Approve a definition for organization` - each organization needs to
  approve a chaincode definition in order to use the chaincode
* `Commit the definition to a channel` - After a sufficient number of
  organizations have approved a chaincode definition, the definition can be
  committed to a channel by one organization
* `Initialize` - start the chaincode container and initialize the chaincode

#### New Class
A new class {@link Chaincode} has been added to the fabric-client to encapsulate
a chaincode definition.
A {@link Chaincode} instance will be created by a client instance's
{@link Client#newChaincode newChaincode()} method.
Then using the new instance, you will be able to build up a chaincode definition
with the following methods.
* {@link Chaincode#setEndorsementPolicy setEndorsementPolicy} - Provide the endorsement policy for this chaincode.
* {@link Chaincode#setCollectionConfig setCollectionConfig} - Provide the collection configuration for this chaincode.
* {@link Chaincode#setSequence setSequence} - Provide the modification number for this chaincode.
* {@link Chaincode#setPackage setPackage} - Provide the package when not packaging this chaincode locally.
* {@link Chaincode#setHash setHash} - Provide the package hash when not doing an install locally of this chaincode.

The chaincode instance will allow you to package a chaincode and install it on
your peers with the following methods:
* {@link Chaincode#package package} Package the files at the locations provided.
* {@link Chaincode#install install} Install the package on the specified peers.

Once the chaincode definition has all the necessary attributes, it may be used
by a channel instance to be defined both for an organization and channel wide.

#### New methods on Channel

The {@link Channel} class has been updated to include methods to approve a
chaincode definition for your organization and commit the definition to a
channel.

* {@link Channel#defineChaincodeForOrg defineChaincodeForOrg} - Approve a
  chaincode definition for your organization.
the chaincode for an organization.
* {@link Channel#defineChaincode defineChaincode} - commit the chaincode
  definition to a channel.

#### New method on Client

The {@link Client} class has been enhanced to include new method to create
a {@link Chaincode} instance.

* {@link Client#newChaincode newChaincode} - Create a {@link Chaincode} instance.


### Step 1: Setup

In this step we will build the application objects needed to perform the
operational steps that follow. You will first need to create a fabric-client
operational environment. The client instance will need to have a user store,
crypto suite, and a user assigned. The target peers, orderer, and channel
instance objects will also be required prior to working with chaincode.

The following sample code assumes that all of the normal fabric-client
setup has been completed and only shows the new chaincode lifecycle
related calls.

```
// get the chaincode instance associated with the client
const mychaincode = client.newChaincode('mychaincode', 'version1');

// The endorsement policy - required.
const policy_def = {
   identities: [
      {role: {name: 'member', mspId: 'org1'}},
      {role: {name: 'member', mspId: 'org2'}}
   ],
   policy: {
       '1-of': [{'signed-by': 0}, {'signed-by': 1}]
   }
};
mychaincode.setEndorsementPolicy(policy_def);

// The collection configuration - optional.
const config_def = [{
   name: 'detailCol',
   policy: {
      identities: [
         {role: {name: 'member', mspId: 'Org1MSP'}},
         {role: {name: 'member', mspId: 'Org2MSP'}}
      ],
      policy: {
         '1-of': [{'signed-by': 0}, {'signed-by': 1}]
      }
   },
   requiredPeerCount: 1,
   maxPeerCount: 1,
   blockToLive: 100
}];
mychaincode.setCollectionConfig(config_def));

// set the sequence (modification) number - required.
mychaincode.setSequence(1); //set to one for a new chaincode
```

### Step 2: Package

The chaincode needs to be packaged before it can be installed on your peers. You
can use the package method to create a chaincode package in the format required
by your peers.

The method create a tar file from you chaincode source code, artifacts, and
metadata files. This step can be done by one organization if you want to ensure
that every channel member is using the same chaincode package. You will also need
to create a package ID that your organization will use to identify the chaincode
package after it is installed on your peers.

The following example packages a golang chaincode. This package can then
optionally be sent to other channel members out of band.

```
// package the source code
const packge_request = {
   chaincodeType: 'golang',
   goPath: '/gopath',
   chaincodePath: '/path/to/code',
   metadataPath: '/path/to/metadat'
}
const package = await mychaincode.package(package_request);
```

You can find a sample metadata file below:
```
{"Path":"github.com/chaincode/fabcar/go","Type":"golang","Label":"fabcarv1"}
```

If you are given the channel package out of band by another organization, use
the following method to import the chaincode package before it can be installed.

```
// use an existing package
mychaincode.setPackage(package);
```

### Step 3: Install

Once the chaincode is packaged, it can be installed on our peers. This step will
be required by all organizations that want to use the chaincode to query the
ledger and endorse transactions. The install method will send the packaged
chaincode to the target peers in your organization. This request will need to be
sent by a peer administrator to be successful.

The following sample assumes that the chaincode object being used has been setup
and packaged or an error would be thrown.

```
// install chaincode package on peers
 const install_request = {
   targets: [peer1, peer2],
   request_timeout: 20000 // give the peers some extra time
 }
const hash = await mychaincode.install(install_request);

// hash value is stored
const same_hash = mychaincode.getHash();
```

### Step 4: Approve for your organization
{: #approve}

Each organization that wants to use the chaincode needs to approve a chaincode
definition for their organization. The transaction to approve a chaincode
definition may be submitted at any time, but must be submitted before the
commit transaction is submitted, or an organization can use the chaincode. Each
organization needs to submit separate approval transactions.

Approving a chaincode definition may also be thought of as a vote for a set of
chaincode parameters by your organization. These approved definitions allow
channel members to agree on a chaincode before it is used on a channel. As a
result, the approved definition needs to be consistent across organizations. If
the chaincode is already running and a definition has already been committed to
the channel, an organization can use the chaincode by installing the chaincode
package on their peers and approving the committed chaincode definition.

The chaincode definition needs to contain the package identifier to associate
the definition approved by your organization with the chaincode installed on
your peers. If your organization does not plan on using a chaincode, you can
approve a chaincode definition without a package ID. This may be helpful if you
want to ensure that a definition has a sufficient number of approvals to be
committed to the channel.

The following sample assumes that the chaincode object being used has been setup
and installed or an error will be thrown.
```
// send a define chaincode for organization transaction
const tx_id = client.newTransactionID();
const request = {
   target: peer1,
   chaincode: mychaincode,
   txId: tx_id
}
// send to the peer to be endorsed
const {proposalResponses, proposal} = await mychannel.defineChaincodeForOrg(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
// send to the orderer to be committed
const results = await mychannel.sendTransaction(orderer_request);
```

### Step 5: Commit definition to the channel

Once a sufficient number of channel members have approved a chaincode definition,
one organization can commit the definition to the channel. In order for the
chaincode definition to be committed successfully, a sufficient number of
organizations need to approve the definition to meet the
`Channel/Application/LifecycleEndorsement` policy. By default this policy is set
to a majority of the organizations on the channel.

You can find a sample commit transaction below. The commit transaction needs to
target a sufficient number of peers in other organizations to collect their
endorsements for the definition. Think of this as a tally of the votes for the
chaincode. If the commit transaction can collect a sufficient number of votes
to meet the LifecycleEndorsement policy, the definition can be committed to the
channel and the chaincode used by channel members.

```
// send a define chaincode for channel transaction
const tx_id = client.newTransactionID();
const request = {
   targets: [peer1, peer3],
   chaincode: mychaincode,
   txId: tx_id
}
// send to the peers to be endorsed
const {proposalResponses, proposal} = await mychannel.defineChaincode(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
// send to the orderer to be committed
const results = await mychannel.sendTransaction(orderer_request);
```

### Step 6: Initialize
This step will start new chaincode on your channel.
This will be the last step before the chaincode may be used for invokes and
queries.
This step will...
The initialize transaction will start the container and then call the
`init` method of the chaincode with the provided arguments.

```
// initialize the chaincode
const tx_id = client.newTransactionID();
const request = {
   chaincodeId : chaincodeId,
   fcn: 'init',
   args: args,
   txId: tx_id
}
// starting the container will take longer than the normal request-timeout
const init_results = await mychannel.sendTransaction(request, 20000);
const orderer_request = {
   proposalResponses: init_results[0],
   proposal: init_results[1]
}
// send to the orderer to be committed
const results = await mychannel.sendTransaction(orderer_request);
```


### Sample situations

In addition to being necessary to use a new chaincode, the chaincode definition
provides you additional flexibility in updating a chaincode and managing
chaincode policies. The following samples will provide code snippets for the
following scenarios:
- `New chaincode`
- `Upgrading a chaincode`
- `Modify an endorsement policy`
- `Join a channel with a running chaincode`

#### New chaincode

When installing chaincode for the first time, all 6 steps must be run.
The following sample shows the code needed when the organization
will be packaging the chaincode, installing it, and being the organization
to define it for the entire channel and initialize it.

```
// step 1:
const mychaincode = client.newChaincode('mychaincode', 'version1');
const policy_def = { ... };
mychaincode.setEndorsementPolicy(policy_def);
mychaincode.setSequence(1); //set to one for a new chaincode

// step 2:
const packge_request = {
   chaincodeType: 'golang',
   goPath: '/gopath',
   chaincodePath: '/path/to/code',
   metadataPath: '/path/to/metadat'
}
const package = await mychaincode.package(package_request);

// step 3:
 const install_request = {
   targets: [peer1, peer2],
   request_timeout: 20000 // give the peers some extra time
 }
const hash = await mychaincode.install(install_request);

// step 4:
const tx_id = client.newTransactionID();
const request = {
   target: peer1,
   chaincode: mychaincode,
   txId: tx_id
}
const {proposalResponses, proposal} = await mychannel.defineChaincodeForOrg(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
const results = await mychannel.sendTransaction(orderer_request);

//step 5:
const tx_id = client.newTransactionID();
const request = {
   targets: [peer1, peer3],
   chaincode: mychaincode,
   txId: tx_id
}
const {proposalResponses, proposal} = await mychannel.defineChaincode(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
const results = await mychannel.sendTransaction(orderer_request);

// step 6:
const tx_id = client.newTransactionID();
const request = {
   chaincodeId : chaincodeId,
   fcn: 'init',
   args: args,
   txId: tx_id
}
const init_results = await mychannel.sendTransaction(request, 20000);
const orderer_request = {
   proposalResponses: init_results[0],
   proposal: init_results[1]
}
const results = await mychannel.sendTransaction(orderer_request);
```

#### Update the chaincode code

When updating the chaincode all 6 steps must be performed and care must be
taken in setting the sequence number to be sure it reflects the current
modification number of the chaincode definition. In this case no other
changes have been done to the chaincode definition since it was first
installed, so the sequence number is 2.

The following sample shows the code needed when the organization
will be packaging the chaincode, installing it, and being the organization
to define it for the entire channel and initialize it.
```
// step 1:
const mychaincode = client.newChaincode('mychaincode', 'version2');
const policy_def = { ... };
mychaincode.setEndorsementPolicy(policy_def);
mychaincode.setSequence(2);

// step 2:
// package the source code
const packge_request = {
   chaincodeType: 'golang',
   goPath: '/gopath',
   chaincodePath: '/path/to/code',
   metadataPath: '/path/to/metadat'
}
const package = await mychaincode.package(package_request);

// step 3:
 const install_request = {
   targets: [peer1, peer2],
   request_timeout: 20000 // give the peers some extra time
 }
const hash = await mychaincode.install(install_request);

// step 4:
const tx_id = client.newTransactionID();
const request = {
   target: peer1,
   chaincode: mychaincode,
   txId: tx_id
}
const {proposalResponses, proposal} = await mychannel.defineChaincodeForOrg(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
const results = await mychannel.sendTransaction(orderer_request);

//step 5:
const tx_id = client.newTransactionID();
const request = {
   targets: [peer1, peer3],
   chaincode: mychaincode,
   txId: tx_id
}
// send to the peers to be endorsed
const {proposalResponses, proposal} = await mychannel.defineChaincode(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
// send to the orderer to be committed
const results = await mychannel.sendTransaction(orderer_request);

// step 6:
// initialize the chaincode
const tx_id = client.newTransactionID();
const request = {
   chaincodeId : chaincodeId,
   fcn: 'init',
   args: args,
   txId: tx_id
}
// starting the container will take longer than the normal request-timeout
const init_results = await mychannel.sendTransaction(request, 20000);
const orderer_request = {
   proposalResponses: init_results[0],
   proposal: init_results[1]
}
// send to the orderer to be committed
const results = await mychannel.sendTransaction(orderer_request);
```

#### Modify the Endorsement policy

When updating the endorsement policy only 4 steps must be performed and care must be
taken in setting the sequence number to be sure it reflects the current
modification number of the chaincode definition. In this case let us assume
that the chaincode has been updated once, so the sequence number is 3.
step 2 maybe skipped as there will not be a new package. It might
seem that we can also skip step 3, but we still need the hash value
to uniquely identify the chaincode source that was installed earlier and has
not been changed.

The following sample shows the code needed when the organization
is redefining it and the organization
to define it for the entire channel.
```
// step 1:
const mychaincode = client.newChaincode('mychaincode', 'version2');
const new_policy_def = { ... };
mychaincode.setEndorsementPolicy(new_policy_def);
mychaincode.setSequence(3);

// step 3:
mychaincode.setHash(hash);

// step 4:
const tx_id = client.newTransactionID();
const request = {
   target: peer1,
   chaincode: mychaincode,
   txId: tx_id
}
const {proposalResponses, proposal} = await mychannel.defineChaincodeForOrg(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
const results = await mychannel.sendTransaction(orderer_request);

//step 5:
const tx_id = client.newTransactionID();
const request = {
   targets: [peer1, peer3],
   chaincode: mychaincode,
   txId: tx_id
}
// send to the peers to be endorsed
const {proposalResponses, proposal} = await mychannel.defineChaincode(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
// send to the orderer to be committed
const results = await mychannel.sendTransaction(orderer_request);
```

#### Joining a channel with a running chaincode

When a new organization wishes to run an existing chaincode it will have to
perform a few of the steps with the existing values.
```
// step 1:
const mychaincode = client.newChaincode('mychaincode', 'version2');
const policy_def = { ... };
mychaincode.setEndorsementPolicy(policy_def);
mychaincode.setSequence(3);

// step 3:
mychaincode.setHash(hash);

// step 4:
const tx_id = client.newTransactionID();
const request = {
   target: peer1, // this peer is in my org
   chaincode: mychaincode,
   txId: tx_id
}
const {proposalResponses, proposal} = await mychannel.defineChaincodeForOrg(request);
const orderer_request = {
   proposalResponses: proposalResponses,
   proposal, proposal
}
const results = await mychannel.sendTransaction(orderer_request);
```

<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.
