This tutorial illustrates the how to handle the lifecycle of your chaincode. The installation, updating, and the starting of chaincode has had been changed with Hyperledger Fabric 2.0.

For more information on:
* getting started with Hyperledger Fabric see
[Building your first network](http://hyperledger-fabric.readthedocs.io/en/latest/build_network.html).
* the configuration of a channel in Hyperledger Fabric and the internal
process of creating and updating see
[Hyperledger Fabric channel configuration](http://hyperledger-fabric.readthedocs.io/en/latest/configtx.html)
* [Service Discovery](https://hyperledger-fabric.readthedocs.io/en/latest/discovery-overview.html)

The following assumes an understanding of the Hyperledger Fabric network
(orderers and peers),
and of Node application development, including the use of the
Javascript `promise` and `async await`.

### Overview
This discussion will focus on the steps that are required by an application
program that will be managing the install, updating and starting of chaincodes
on your Hyperledger Fabric network. The existing api's for managing the life-cycle
of your pre 2.0 chaincodes will still be available in fabric-client and will
not be discussed here.

The steps to manage chaincode:
* `package` - package the chaincode source artifacts
* `install` - push to the network
* `define for organizations` - each organization will define a specific chaincode xxxxx
* `define for the channel` - the channel members will agree to run a specific chaincode
* `initialize` - start the chaincode container and initialize the chaincode

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

The chaincode instance will allow for the packaging and installing of chaincode
to a peer within your organization with the following methods.
* {@link Chaincode#package package} Package the files at the locations provided.
* {@link Chaincode#install install} Install the package on the specified peers.

Once the chaincode definition has all the necessary attributes, it may be used
by a channel instance to be defined both for an organization and channel wide.

#### New methods on Channel
The {@link Channel} class has been enhanced to include new methods to define
a chaincode for an organization and for the channel wide use.

* {@link Channel#defineChaincodeForOrg defineChaincodeForOrg} - Define
the chaincode for an organization.
* {@link Channel#defineChaincode defineChaincode} - Define
the chaincode for a channel.

#### New method on Client
The {@link Client} class has been enhanced to include new method to create
a {@link Chaincode} instance.

* {@link Client#newChaincode newChaincode} - Create a {@link Chaincode} instance.


### Setup
This might be considered a step, but in our discussion it will be a setup of
the application objects needed to perform the operational steps that follow.
The normal setup of an operational environment is required with a client instance
that has a user store, crypto suite, and a user assigned. The target peers,
orderer, and channel objects will also be required prior to doing the first
step. The following sample code assumes all that has been done.

```
// get the chaincode instance associated with the client
const mychaincode = client.newChaincode('mychaincode', 'version1');

// The endorsement policy - required.
mychaincode.setEndorsementPolicy(policy_def);
// The collection configuration - optional.
mychaincode.setCollectionConfig(config_def));

// set the sequence (modification) number - optional.
mychaincode.setSequence(1); //default is 1 when not set
```

### Step 1: Package
This step will only be required by a single organization. The organization will
take the source artifacts, chaincode source code and metadata files, and have
the fabric-client package them. This package may then be sent to other
organizations or administrators of your fabric network to be installed on
the network.

The following example is for the organization that packages the code
and then will send to other organizations to be installed.

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

The following example is for the organization that did not do the
packaging, but will do the install.

```
// use an existing package
mychaincode.setPackage(package);
```

### Step 2: Install
This step will be required by all organizations that will be running the chaincode
(executing transactions). The install will take the packaged source code artifacts
and sent it to a peer or peers in your organization. Installing chaincode requires
admin authority for the organization. The peer will return a hash value, a unique
identifer for this chaincode package. The hash value will be needed later when
the chaincode is defined.

```
// sample code here
```

### Step 3: Define for your organization
This step wlll define a chaincode for your organization.
The defining action will be required by enough organizations
to satisfy the channel's chaincode lifecycle system policy.
By default this will be a majority of the
organizations on the channel. Each of these organizations will endorse and
commit a transaction that defines a chaincode and it's operational settings.
This may be thought of not only as a definition of the chaincode but a vote
to authorize the running of the chaincode with these settings.
These are separate organizational chaincode definitions
transactions submitted by each organizations and each committed to the
ledger. This definition is for a specific organization, specific settings,
and only on this channel.
The organizational chaincode definition transaction may be submitted at any
time, but must be submitted prior to being able to execute the chaincode
on a peer within the organization. This is how a new organization may start
running an existing chaincode other organization are currently running.
The transactions must include the exact same chaincode definition.
The definition does not include the package, it includes the hash value
that uniquely identifies the chaincode source artifacts.
An organization will be able to submit the organizational chaincode definition
transaction without having installed the package, but has received the hash
value from an organization that did install the package.

```
// sample code here
```

### Step 4: Define for the channel
This step will define a chaincode for your channel. The defining action will
not change the chaincode or it's settings, but rather confirm the
organizational chaincode definition for the channel. 
The channel chaincode definition transaction will
be submitted by only one organization. 
A successful transaction must be endorsed by enough
organizations to satisfy the channel's chaincode lifecycle system policy
and there must be enough committed organizational chaincode definition
transactions committed that also satisfies the
channel's chaincode lifecycle system policy.
Think of this step as the tallying of the votes to run the chaincode.
The action to actually count the votes must be approved by enough members
and then there must be enough votes before the chaincode will
be allowed to run.
When only a chaincode setting has been changed, like an endorsement policy,
a successful commit of the channel chaincode definition transaction will
enable the new policy for this chaincode. The initialize step will not be
required as the chaincode container will not have to change. If this is
for a new chaincode or an update to the chaincode code, then the initialize
step will be required.

```
// sample code here
```

### Step 5: Initialize
This step will start new chaincode on your channel.
This will be the last step before the chaincode may be used for invokes and
queries.
This step will...
The initialize transaction will start the container and then call the
`init` method of the chaincode with the provided arguments.

```
// sample code here
```


### Sample situations
The following samples will show the steps needed to perform the titled task.
Different situations require a different set of steps.

#### New chaincode

```
// sample code here
```

#### Update the chaincode code

```
// sample code here
```

#### Modify the Endorsement policy

```
// sample code here
```

#### New organization needs to run the chaincode

```
// sample code here
```

<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.

