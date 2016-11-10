const tutil = require('./test-util.js');
const path = require('path');
const testUtil = require('./util.js');

var cwd = __dirname;
console.log('__dirname: ', __dirname);

function getUserHome() {
	return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

var keyValStorePath1 = path.join(getUserHome(), 'kvsTemp');
var keyValStorePath2 = keyValStorePath1 + '2';
var keyValStorePath3 = keyValStorePath2 + '3';
var keyValStorePath4 = testUtil.KVS;
var keyValStorePath5 = '/tmp/caTestsKeyValStore';
var keyValStorePath6 = 'tmp/keyValStore1';
var keyValStorePath7 = 'tmp/keyValStore2';
var keyValStorePath8 = '/tmp/keyValStore2';
var keyValStorePath9 = '/tmp/keyValStore3';
var keyValStorePath10 = '/tmp/keyValStore4';
var keyValStorePath11 = '/tmp/chainKeyValStorePath';


var keyStores = [keyValStorePath1, keyValStorePath2, keyValStorePath3, keyValStorePath4,
	keyValStorePath5, keyValStorePath6, keyValStorePath7, keyValStorePath8,
	keyValStorePath9, keyValStorePath10, keyValStorePath11
];

keyStores.forEach(function(value) {
	tutil.rmdir(value);
	console.log('removing ', value);
});
