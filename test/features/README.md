# Cucumber Test Features For Fabric-SDK-Node

Welcome to the Fabric-SDK-Node Cucmber test readme. Below are some notes on these tests, but before you go any further, here are some general contribution guide lines:
 - Each feature file must have its own tag
 - All features and scenarios must be isolated from one another (no relying on other tests to create things for you!)
   - Each feature must be runnable in isolation
   - Each scenario must be runnable in isolation
- Full suite should complete in the presence of failures; it is important that the suite completes on all eventualities and not hang if a test fails. For instance, this can occur if a process is not terminated.
- When adding new step files, these must be included within `/steps/index.js` so that they are discoverable by the feature file(s)
- Tags are used to run Before/After functions for specific scenarios. For examples of this, refer to the `network_api.feature` that requires a clean up process to run in the event of a test failure.

This test suite is intended to provide high level test coverage from a scenario perspective, and tests herein represent those at the top of the test pyramid. Consequently, these test should be added to with due consideration and should encapsulate the completion of a high level user task; for more fine grained testing, the FV or unit test frameworks should be used.

## Structure

The folder structure is the following:

```
features
│   README.md
│   feature_file.feature 
│
└───chaincode
│   │
│   └───cc1
│       │
│       └───go
│       └───node
│   
└───config
│   │   profile.json
│   │   policies.json
│   └───crypto-config
│  
└───docker-compose
│       compose-files.yaml
│  
└───lib
│       helper-files.js
│  
└───steps
│       step-files.js
│  
└───support
        support-files.js
```

- All feature files are located in the parent `features` directory
- `chaincode` holds all the chaincode files used within the cucmber tesst, with each chaincode contained within a specific named folder, itself decomposed into goLang and node. The structure here is important, since step files rely on the consistent location and naming strategy to deploy named chaincode of a specific type.
- `config` contains connection profiles, a json document of all possible endorsement policies, and a crypto-config directory that contains the crypto-material for the network defined within the docker-compose folder.
- `docker-compose` contains the two test networks, tls and non-tls, that are used within the cucumber tests.
- `lib` contains helper files used by step files.
- `steps` contains all the step files required by the feature files that exist in the parent directory.
- `support` contains two framework files: the main `index.js` file called by the cucumber test runner, and a `hooks.js` file that is used to provide tag based before/after hooks.


## Running the Tests

The tests are run at a high level within the `/build` directory using the main `test.js` gulp file. To run the test issue the command `gulp run-test-cucumber`. This will run all feature files located within `/test/features`.
