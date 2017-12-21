This README provides instructions for running the end-to-end integration
test (test/integration/e2e.js) using private keys in an HSM.

1. Modify the fabric-client/config/default.json setting the following:

        "crypto-hsm": true,
        "crypto-pkcs11-lib": "path to the PKCS11 library",
        "crypto-pkcs11-slot": "0",
        "crypto-pkcs11-pin": "userpin",

   NOTE: Perform necessary installation/configuration for your HSM and modify
         the lib, slot and pin accordingly.

2. Modify test/integration/e2e/config.json and specify:

        "use-pkcs11-keys": true

3. Configure fabric-ca-client with configuration for using the PKCS11 BCCSP
   by modifying ~/.fabric-ca-client/fabric-ca-client-config.yaml:

bccsp:
...
    pkcs11:
        library: path to the PKCS11 library
        pin:
        label:
        hash: SHA2
        security: 256
        filekeystore:
            # The directory used for the software file-based keystore
            keystore: msp/keystore

4. Change directory to test/fixtures/channel:

	cd test/fixtures/channel

5. Generate private keys, associated certificate signing requests and
   certificates for all of the Admin users:

	PKCS11_LABEL=fabric-sdk-node PKCS11_PIN=userpin ./pkcs11/genAdminPkcs11.sh

   NOTE: fabric-ca-client must be in PATH and support the gencsr command.
         Modify the above command for your setup.

6. Regenerate the genesis block to include the new Admin users:

	configtxgen -profile TwoOrgsOrdererGenesis -outputBlock twoorgs.genesis.block

7. Start all of the docker containers:

	cd test/fixtures
	docker-compose up

8. In a separate terminal in the fabric-sdk-node root directory run the e2e integration test:

	node test/integration/e2e.js


