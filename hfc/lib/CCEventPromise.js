
var CCEventPromise = class {

	constructor() {
		this.timedout = true;
		this.timeoutId = null;
		this.promise = null;
	}

	trigger(chain, chaincode_id, eventNameRegex, timeout, tiggerfnc) {
                var self = this;
		var eh = chain.getEventHub();
		self.promise = new Promise(function (resolve, reject){
		var regid = eh.registerChaincodeEvent(chaincode_id,
                                  eventNameRegex,
                                  function(event) {
					self.timedout = false;
					resolve();
					if (self.timeoutId) {
						clearTimeout(self.timeoutId);
					}
					eh.unregisterChaincodeEvent(regid);
				});
		tiggerfnc();
		if(self.timedout) {
			self.timeoutId = setTimeout(function() {
						if(self.timedout) {
							eh.unregisterChaincodeEvent(regid);
							return reject();
						} else {
							return resolve();
						}
					}, timeout);
					
		}
	});
        return self.promise;
	}
};

module.exports = CCEventPromise;
