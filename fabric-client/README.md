## Hyperledger Fabric Client for Node.js

[![NPM](https://nodei.co/npm/fabric-client.svg?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/fabric-fabric-client/)

SDK for writing node.js applications to interact with [Hyperledger Fabric](http://hyperledger-fabric.readthedocs.io/en/latest/).

This package encapsulates the APIs to interact with Peers and Orderers of the Fabric network to install and instantiate chaincodes, send transaction invocations and perform chaincode queries. 

Additional packages are also provided:
1. `fabric-ca-client`, to interact with the fabric-ca to manage user certificates.
2. `fabric-network`, to provide APIs to connect to a Fabric network, submit transactions and perform queries against the ledger.
3. `fabric-common`, encapsulates the common code used by all fabric-sdk-node packages.
4. `fabric-protos`, encapsulates the Protocol Buffer files and generated JavaScript classes for Hyperledger Fabric

For application developer documentations, please visit [https://fabric-sdk-node.github.io/](https://fabric-sdk-node.github.io/)

<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.
s

### Configuring and running Hardware Security Module tests

For contributors, below are the steps required to run Hardware Security Module (HSM) tests locally.

#### Install SoftHSM

In order to run the tests in the absence of a real HSM, a software emulator of the PKCS#11 interface is required.
For more information please refer to [SoftHSM](https://www.opendnssec.org/softhsm/).

SoftHSM can either be installed using the package manager for your host system:

* Ubuntu: `apt-get install softhsm2`
* macOS: `brew install softhsm`
* Windows: **unsupported**

Or compiled and installed from source:

1. install openssl 1.0.0+ or botan 1.10.0+
2. download the source code from <https://dist.opendnssec.org/source/softhsm-2.2.0.tar.gz>
3. `tar -xvf softhsm-2.2.0.tar.gz`
4. `cd softhsm-2.2.0`
5. `./configure --disable-gost` (would require additional libraries, turn it off unless you need gost algorithm support
   for the Russian market)
6. `make`
7. `sudo make install`

#### Specify the SoftHSM configuration file

```bash
export SOFTHSM2_CONF="./test/fixtures/hsm/softhsm2.conf"
```

#### Create a token to store keys in the HSM

```bash
softhsm2-util --init-token --slot 0 --label "My token 1"
```

Then you will be prompted two PINs: SO (Security Officer) PIN that can be used to re-initialize the token, and user PIN
(see below) to be used by applications to access the token for generating and retrieving keys.

#### Configure tests

By default the tests run with SoftHSM using slot `0` and user PIN `98765432`. If your configuration is different, use
these environment variables to pass in the values:

* PKCS11_LIB - path to the SoftHSM2 library; if not specified, the tests search a list of common install locations
* PKCS11_PIN
* PKCS11_SLOT

To turn these tests off, set environment variable `PKCS11_TESTS` to `false`:
```bash
export PKCS11_TESTS=false
```
