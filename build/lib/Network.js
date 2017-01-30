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

var log4js = require('log4js');
var logger = log4js.getLogger('Network');

var Network = class {

	constructor() {

	}

	start(current_working_directory, docker_compose_file) {
		logger.info('start - current_workig_directory:'+current_working_directory +'   docker_compose_file:'+ docker_compose_file);
		var spawn = require('child_process').spawnSync;
		return new Promise(function(resolve, reject) {
			try {
				var net = spawn('docker-compose', ['-f', docker_compose_file, 'up', '-d'], {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
					cwd: current_working_directory
				});
			}
			catch(err) {
				logger.error('start - rejecting spawn err='+err);
				return reject(err);
			}

			if(!net) {
				logger.error('start - rejecting docker-compose start no status');
				return reject(new Error('rejecting docker-compose start no status'));
			}
			else if(net.error){
				logger.error('start - results of the docker-compose up net=' + JSON.stringify(net));
				return reject(net.error);
			}

			if (net.status != 0 && (typeof net.status != null)) {
				logger.error('start - rejecting docker-compose up -d with net.status='+net.status);
				return reject(net);
			} else {
				logger.info('start - resolving docker-compose up -d with net.status='+net.status);
				return resolve(net);
			}
		});
	}

	stop(current_working_directory, docker_compose_file) {
		logger.info('stop- current_workig_directory:'+current_working_directory +'   docker_compose_file:'+ docker_compose_file);

		var spawn = require('child_process').spawnSync;
		return new Promise(function(resolve, reject) {
			var net = null;
			try {
				net = spawn('docker-compose', ['-f', docker_compose_file, 'stop'], {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
					cwd: current_working_directory
				});
			}
			catch(err) {
				logger.error('stop - rejecting spawn err='+err);
				return reject(err);
			}

			if(!net) {
				logger.error('stop - rejecting docker-compose stop no status');
				return reject(new Error('rejecting docker-compose stop no status'));
			}
			else if(net.error){
				logger.error('stop - results of the docker-compose stop net=' + JSON.stringify(net));
				return reject(net.error);
			}

			if (net.status != 0 && (typeof net.status != null)) {
				logger.error('stop - rejecting docker-compose stop with net.status='+net.status);
				return reject(net);
			} else {
				logger.info('stop - stopped docker-compose -- now remove net.status='+net.status);
				var net = spawn('docker-compose', ['-f', docker_compose_file, 'rm', '-f'], {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
					cwd: current_working_directory
				});
				if (net.status != 0 && (typeof net.status != null)) {
					logger.error('stop - rejecting docker-compose rm -f  with net.status='+net.status);
					return reject(net);
				} else {
					logger.info('stop - resolving docker-compose rm -f  with net.status='+net.status);
					return resolve(net);
				}
			}
		});
	}

};
module.exports = Network;
