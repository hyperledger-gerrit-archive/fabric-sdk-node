const path = require('path');
const testUtil = require('../unit/util.js');

var cwd = __dirname;
console.log('__dirname: ', __dirname);

function getUserHome() {
	return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

var keyStores = [
	path.join(getUserHome(), 'kvsTemp'),
	'/tmp/keyValStore',
	'/tmp/hfc-key-store',
	testUtil.KVS
];

module.exports.removeKeyStores = function() {
	keyStores.forEach(function(value) {
		testUtil.rmdir(value);
		console.log('removing ', value);
	});
};
