
This tutorial illustrates how to use the Node.js SDK APIs to sign a transaction with the user's private key offline.

Most use cases the `fabric-sdk-node` will be used as a lib of the backend server. And `fabric-sdk-node` comes with the crypto suit to persistence the user's credentials. However, keep the private key at server side is dangerous for some business scenarios that requires higher privacy. What if the user want keep his private key secret himself, and don't trust anyone for using his private key?

Now `fabric-sdk-node` comes with the ability to sign a transaction offline. SDK don't have to know the user's private key. After generate the transaction proposal, it's the identity's response to sign the transaction and send the `signed transaction` back to SDK.

## The transaction flow for signing a transaction offline

After `fabric-sdk-node` supports signing a tx offline, the transaction flow for a chaincode invoke changed.

With the user context (cert and private key) set at SDK:

1. Endorse -> `Channel.sendTransactionProposal()`
2. Commit -> `Channel.sendTransaction()`

Without the user's private key at SDK:

1. Endorse:
    1. generate `a unsigned transaction proposal` with identity's certificate -> `Channel.generateUnsignedProposal()`
    2. sign this `unsigned transaction proposal` with identity's private key
    3. send this `signed transaction proposal` to peer and get the endorsement by -> `Channel.sendSignedProposal()`
2. Commit:
    1. generate `a commit transaction proposal` with the endorser's response -> `Channel.generateUnsignedTransaction()`
    2. sign this `unsigned transaction` with identity's private key
    3. commit this `signed transaction` by -> `Channel.sendSignedTransaction()`

## How to sign a transaction by an identity's private key

There might be several digital signature algorithms. If we set userContext at SDK side, fabric-sdk-node would use ECDSA with algorithm 'EC' by default.

Here is how this works with a offline private key.

1. first, generate a `unsigned transaction proposal` with the identity's certificate
    ```javascript
    const certPem = '<PEM encoded certificate content>';
    const mspId = 'Org1MSP'; // the msp Id for this org

    const transactionProposal = {
        fcn: 'move',
        args: ['a', 'b', '100'],
        chaincodeId: 'mychaincodeId',
        channelId: 'mychannel',
    };
    const { proposal, txId } = channel.generateUnsignedProposal(transactionProposal, mspId, certPem);
    // now we have the 'unsigned proposal' for this transaction
    ```

2. calculate the hash of the transaction proposal bytes.

    A hash algorithm should be picked and calculate the hash of the transaction proposal bytes.

    There exists multiple hash functions (such as SHA2/3). by default, fabric-sdk-node will use 'SHA2' with key size 256.

    User may use an alternative implementation

    ```javascript
    const proposalBytes = proposal.toBuffer(); // the proposal comes from step 1

    const hashFunction = xxxx; // A hash function by the user's desire

    const digest = hashFunction(proposalBytes); // calculate the hash of the proposal bytes
    ```

3. calculate the signature for this transaction proposal

    We may have a series of choices for the signature algorithm. Including asymmetric keys (such as ECDSA or RSA), symmetric keys (such as AES).

    By default the SDK will use ECDSA with algorithm 'EC'.

    ```javascript
    // This is a sample code for signing the digest from step2 with EC.
    // Different signature algorithm may have different interfaces

    const elliptic = require('elliptic');
    const { KEYUTIL } = require('jsrsasign');

    const privateKeyPEM = '<The PEM encoded private key>';
    const { prvKeyHex } = KEYUTIL.getKey(privateKeyPEM); // convert the pem encoded key to hex encoded private key

    const EC = elliptic.ec;
    const ecdsaCurve = elliptic.curves['p256'];

    const ecdsa = new EC(ecdsaCurve);
    const signKey = ecdsa.keyFromPrivate(prvKeyHex, 'hex');
    const sig = ecdsa.sign(Buffer.from(digest, 'hex'), signKey);

    // now we have the signature, next we should send the signed transaction proposal to peer
    const signature = Buffer.from(sig.toDER());
    const signedProposal = {
        signature,
        proposal_bytes: proposalBytes,
    };
    ```

4. send the `signed transaction proposal` to peer
    ```javascript
    const sendSignedProposalReq = { signedProposal, targets };
    const proposalResponses = await channel.sendSignedProposal(sendSignedProposalReq);

    const sendSignedProposalReq = { signedProposal, targets };
    const proposalResponses = await channel.sendSignedProposal(sendSignedProposalReq);
    // check the proposal responses, if all good, commit the transaction
    ```

5. similiar to step 1, generate a `unsigned transaction`

    ```javascript
    const commitReq = {
        proposalResponses,
        proposal,
    };

    const commitProposal = await channel.generateUnsignedTransaction(commitReq);
    ```

6. similiar to step 3, sign this `unsigned transaction` with user's private key
    ```javascript
    const signedCommitProposal = signProposal(commitProposal);
    ```

7. commit this `signed transaction`
    ```javascript
    const response = await channel.sendSignedTransaction({
        signedProposal: signedCommitProposal,
        request: commitReq,
    });

    // response.status should be 'SUCCESS' if the commit succeed
    ```

A full test can be found at `fabric-sdk-node/test/integration/signTransactionOffline.js`
