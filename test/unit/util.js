var path = require('path');
var fs = require('fs');

module.exports.CHAINCODE_PATH = 'github.com/example_cc';
module.exports.CHAINCODE_MARBLES_PATH = 'github.com/marbles_cc';
module.exports.KVS = '/tmp/hfc-test-kvs';

// temporarily set $GOPATH to the test fixture folder
module.exports.setupChaincodeDeploy = function() {
	process.env.GOPATH = path.join(__dirname, '../fixtures');
};

function getSubmitter(username, password, chain, t) {
	return chain.getUser(username)
	.then(
		function(user) {
			if (user.isEnrolled()) {
				t.pass('Successfully loaded member from persistence');
				return Promise.resolve(user);
			} else {
				// need to enroll it with COP server
				var cop = new copService('http://localhost:8888');

				return cop.enroll({
					enrollmentID: username,
					enrollmentSecret: password
				}).then(
					function(enrollment) {
						t.pass('Successfully enrolled user \'' + username + '\'');

						var member = new Member(username, chain);
						member._enrollment = enrollment;
						return member.saveState();
					}
				).then(
					function(success) {
						return chain.getUser(username);
					}
				).catch(
					function(err) {
						t.fail('Failed to enroll and persist user. Error: ' + err);
						t.end();
					}
				);
			}
		},
		function(err) {
			t.fail('Failed to obtain a member object for user. Error: ' + err);
			t.end();
		}
	);
}

module.exports.getSubmitter = function(chain, test) {
	return getSubmitter('admin', 'adminpw', chain, test);
};

module.exports.rmdir = function(path) {
	if (fs.existsSync(path)) {
		fs.readdirSync(path).forEach(function(file, index) {
			var curPath = path + '/' + file;
			if (fs.lstatSync(curPath).isDirectory()) { // recurse
				rmdir(curPath);
			} else { // delete file
				fs.unlinkSync(curPath);
			}
		});
		fs.rmdirSync(path);
	}
};
