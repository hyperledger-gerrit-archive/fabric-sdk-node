'use strict';
var path = require('path');

// Load this module, and test itself.
//
require('surveyor')({
	testDir: __dirname,
	//specDir: 'unit', // Optional. Default is 'spec', eg. {testDir}/spec
	//globalFixtures: [
	//     'global/globalA,
	//     'global/globalB'
	// ],
	exitOnFinish: true
});

//require('surveyor')({
//    testDir: '/home/ibmadmin/gopath/src/github.com/hyperledger/fabric-sdk-node/test', // eg. __dirname
//    // specDir: 'specFolder', // Optional. Default is 'spec', eg. {testDir}/spec
//    globalFixtures: [ // Optional. These files are expected to return test scopes
//        'globals/A',
//        'globals/B'
//    ]
//})