var tutil = require('test/unit/test-util.js');
var goPath = tutil.goPath;
vat testFolder = goPath + "src/github.com/hyperledger/fabric-sdk-node/test/unit";

require('surveyor')({
    testDir: testFolder,
    globalFixtures: [ // Optional. These files are expected to return test scopes
        'globals/A',
        'globals/B'
    ]
});
