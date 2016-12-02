Fabric = class {
	/**
	 */
	constructor() {

	}

	start(current_working_directory, docker_compose_file) {
		console.log('Fabric.start() - current_workig_directory:'+current_working_directory +'   docker_compose_file:'+ docker_compose_file);
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
				console.log('Fabric.start() rejecting spawn err='+err);
				return reject(err);
			}

			if(!net) {
				console.log('Fabric.start() rejecting docker-compose start no status');
				return reject(new Error('rejecting docker-compose start no status'));
			}
			else if(net.error){
				console.log('Fabric.start() results of the docker-compose up net=' + JSON.stringify(net));
				return reject(net.error);
			}

			if (net.status != 0 && (typeof net.status != null)) {
				console.log('Fabric.start() rejecting docker-compose up -d with net.status='+net.status);
				return reject(net);
			} else {
				console.log('Fabric.start() resolving docker-compose up -d with net.status='+net.status);
				return resolve(net);
			}
		});
	}

	stop(current_working_directory, docker_compose_file) {
		console.log('Fabric.stop() - current_workig_directory:'+current_working_directory +'   docker_compose_file:'+ docker_compose_file);

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
				console.log('Fabric.stop() rejecting spawn err='+err);
				return reject(err);
			}

			if(!net) {
				console.log('Fabric.stop() rejecting docker-compose stop no status');
				return reject(new Error('rejecting docker-compose stop no status'));
			}
			else if(net.error){
				console.log('Fabric.stop() results of the docker-compose stop net=' + JSON.stringify(net));
				return reject(net.error);
			}

			if (net.status != 0 && (typeof net.status != null)) {
				console.log('Fabric.stop() rejecting docker-compose stop with net.status='+net.status);
				return reject(net);
			} else {
				console.log('Fabric.stop() stopped docker-compose -- now remove net.status='+net.status);
				var net = spawn('docker-compose', ['-f', docker_compose_file, 'rm', '-f'], {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
					cwd: current_working_directory
				});
				if (net.status != 0 && (typeof net.status != null)) {
					console.log('Fabric.stop() rejecting docker-compose rm -f  with net.status='+net.status);
					return reject(net);
				} else {
					console.log('Fabric.stop() resolving docker-compose rm -f  with net.status='+net.status);
					return resolve(net);
				}
			}
		});
	}

};
module.exports = Fabric;
