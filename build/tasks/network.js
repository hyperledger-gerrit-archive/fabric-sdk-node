/*
 Copyright 2017 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

	  http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
'use strict';

var gutil = require('gulp-util');
var gulp = require('gulp');
var tape = require('gulp-tape');
var tapColorize = require('tap-colorize');
var istanbul = require('gulp-istanbul');
var path = require('path');

var Fabric = require('../lib/Network.js');
var testUtil = require('../../test/unit/util.js');

/**
 *  Utility method to start the fabric network
 *
 *  May be called with the two arguments
 * --cwd current working directory
 * --dcf docker compose file location
 *
 */
gulp.task('network-start', ['network-stop'], function(cb) {
	var current_working_directory = path.join(__dirname, '../../test/fixtures');
	var i = process.argv.indexOf('--cwd');
	if(i>-1) {
		current_working_directory = process.argv[i+1];
	}
	var docker_compose_file = './docker-compose.yml';
	var j = process.argv.indexOf('--dcf');
	if(j>-1) {
		docker_compose_file = process.argv[j+1];
	}

	var fabric_network = new Fabric();
	fabric_network.start(current_working_directory, docker_compose_file).
		then(function(net) {
			var error;
			gutil.log('start output[0] ::'+ net.output[0]);
			gutil.log('start output[1] ::'+ net.output[1]);
			gutil.log('start output[2] ::'+ net.output[2]);
			if(net.status == 0) {
				gutil.log('*** fabric network started successfully\n');
			} else {
				gutil.log('fabric network not started successfully status='+net.status);
				error = net.status;
			}
			cb(error);
		}).
		catch(function(err) {
			gutil.log('fabric network not started successfully err='+ err.stack ? err.stack : err);
			cb(err);
		}
	);
});

/**
 *  Utility method to stop the fabric network
 *
 *  May be called with the two named arguments
 * --cwd current working directory
 * --dcf docker compose file name in current working directory
 *
 */
gulp.task('network-stop', [], function(cb) {
	var current_working_directory = path.join(__dirname, '../../test/fixtures');
	var i = process.argv.indexOf('--cwd');
	if(i>-1) {
		current_working_directory = process.argv[i+1];
	}
	var docker_compose_file = 'docker-compose.yml';
	var j = process.argv.indexOf('--dcf');
	if(j>-1) {
		docker_compose_file = process.argv[j+1];
	}
	var fabric_network = new Fabric();
	fabric_network.stop(current_working_directory, docker_compose_file)
	.then(function(net) {
		var error;
		gutil.log('stop output[0] ::'+ net.output[0]);
		gutil.log('stop output[1] ::'+ net.output[1]);
		gutil.log('stop output[2] ::'+ net.output[2]);
		if(net.status == 0) {
			gutil.log('*** fabric network stopped successfully\n');
		} else {
			gutil.log('fabric network not stopped successfully status='+net.status);
			error = net.status;
		}
		cb(error);
	})
	.catch(function(err) {
		gutil.log('fabric network not stopped successfully err='+ err.stack ? err.stack : err);
		cb(err);
	});
});

gulp.task('remove-keystore', ['network-stop'], function(cb) {
	testUtil.rmdir(testUtil.KVS);
	gutil.log('removed keyvalue store ', testUtil.KVS);
	cb();
});
