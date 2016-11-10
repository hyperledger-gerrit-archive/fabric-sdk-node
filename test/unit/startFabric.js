'use strict';

const tutil = require('./test-util.js');
const Fabric = require('../../lib/Fabric.js');
const test = require('tape');

test('Start fabric network', function(t) {
	t.plan(1);
	var fabric = new Fabric('nodeSdk', tutil.tlsOn);
	fabric.start().then(
		function(net) {
			console.log(net.output[0]);
			console.log(net.output[1]);
			console.log(net.output[2]);
			t.equal(net.status, 0, 'network started successfully');
		}).
	catch(function(fail) {
		console.log(fail.output[0]);
		console.log(fail.output[1]);
		console.log(fail.output[2]);
		t.fail('network startup failed');
	});
});
