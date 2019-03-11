
This tutorial illustrates how to perform FabToken operations using
the Node.js fabric-client SDK. FabToken is a new feature in 
Hyperledger Fabric 2.0 Alpha and fabric-client 2.0 Alpha. 

Refer to the following document to understand the concepts and functions in FabToken.
* FabToken document (link not available yet)

For more information on:
* getting started with Hyperledger Fabric see
[Building your first network](http://hyperledger-fabric.readthedocs.io/en/latest/build_network.html).
* the configuration of a channel in Hyperledger Fabric and the internal
process of creating and updating see
[Hyperledger Fabric channel configuration](http://hyperledger-fabric.readthedocs.io/en/latest/configtx.html)

The following assumes an understanding of the Hyperledger Fabric network
(orderers, peers, and channels),
and of Node.js application development, including the use of the
Javascript `promise` and `async await`.

### Overview

This discussion will focus on the APIs for an application program to perform
the following token operations:

* `issue` - allows an issuer to issue new tokens to the specified users.
* `transfer` - allows to transfer the user's owning tokens to other users.
* `redeem` - allows to redeem the user's owning tokens. Redeem is the opposite of issue.
* `list` - allows a user to query all the unspent tokens owned by the user.

#### New Class

A new class {@link TokenClient} has been added to the fabric-client to support token operations.
A {@link TokenClient} instance will be created by a client instance's
{@link Client#newTokenClient newTokenClient()} method.
Then using the new instance, you will be able to invoke the following methods.

* {@link TokenClient#issue issue} - Issue new tokens to the specified users.
* {@link TokenClient#transfer transfer} - Transfer owning tokens to other users.
* {@link TokenClient#redeem redeem} - Redeem owning tokens.
* {@link TokenClient#list list} - Query owning tokens.

#### New Method on Client

The {@link Client} class has been enhanced to include new method to create
a {@link TokenClient} instance. Like Client, a TokenClient is associated with a user context.

* {@link Client#newChaincod newTokenClient} - Create a {@link TokenClient} instance.

### Sample code

The following sample code assumes that all of the normal fabric-client setup
has been completed and only shows the TokenClient calls.
It demonstrates how to issue, transfer, redeem, and list tokens.

#### Prerequisites:

Assume the following objects have been created:

* issuer, client (associated to issuer context)
* user1 identity, client1 (associated to user1 context)
* user2 identity, client2 (associated to user1 context)
* mychannel


#### Use case 1: issue tokens
The issuer issues tokens to user1 and user 2

```
// create a TokenClient instance from client
const tokenclient = client.newTokenClient(mychannel);

// create a request (see TokenRequest doc) for issue
const txId = client.newTransactionID();
const param1 = {
	owner: user1Identity.serialize(),
	type: 'USD',
	quantity: tokenUtils.toHex(500),
};
const param2 = {
	owner: user2Identity.serialize(),
	type: 'EURO',
	quantity: tokenUtils.toHex(200),
};
const issueRequest = {
	params: [param1, param2],
	txId: txId,
};

// issuer calls issue method to issue tokens to user1 and user2
const result = await tokenClient.issue(issueRequest);

// The above method broadcasts the transaction to the orderer.
// You can register the transaction event

#### Use case 2: list tokens
user1 lists all unspent tokens owned by user1

// create a TokenClient instance from client1
const user1Tokenclient = client1.newTokenClient(mychannel);

// user1 list his tokens
const mytokens = await user1TokenClient.list();

// iterate the tokens to get token id, type, and quantity
for (const token of tokens) {
	// get token.id, token.type, and token.quantity
	// token.id will be used for transfer and redeem
}

#### Use case 3: transfer tokens
Before a user transfers his tokens, he must get the token id(s) that he wants to transfer.
Assume user1 wants to transfer 'tokenid1' to user2. The token quantity is 500 and
user1 wants to transfer 300 to user2. He will transfer the remaining 200 to himself.

```
// Create a request (see TokenRequest doc) for transfer.
// After transfer, user2 will have 300 quantity of the token and user1 will have 200 quantity of the token.
const txId = client1.newTransactionID();
const param1 = {
	owner: user2Identity.serialize(),
	quantity: tokenUtils.toHex(300),
};
const param2 = {
	owner: user1Identity.serialize(),
	quantity: tokenUtils.toHex(200),
};
const transferRequest = {
	tokenIds: [tokenid1],
	params: [param],
	txId: txId,
};

// user1 calls transfer method to transfer the token to user2
const mytokens = await user1TokenClient.transfer(transferRequest);

// The above method broadcasts the transaction to the orderer.
// You can register the transaction event
```

#### Use case 4: redeem tokens
Before a user redeems his tokens, he must get the token id(s) that he wants to transfer.
Assume user2 wants to redeem "tokenid2" and he wants to redeem 100 out of 300.

// create a TokenClient instance from client2
const user2Tokenclient = client2.newTokenClient(mychannel);

// create a request (see TokenRequest doc) for redeem
const txId = client2.newTransactionID();
const param = {
	quantity: tokenUtils.toHex(100),
};
const redeemRequest = {
	params: [param],
	txId: txId,
};

// user2 cals redeem method. After redeem, user2 will have 200 left, with a new token id.
// The old token id will be gone since it has been spent.
const result = await user2TokenClient.redeem(redeemRequest);

// The above method broadcasts the transaction to the orderer.
// You can register the transaction event
