let utils = require('fabric-client/lib/utils.js');
let logger = utils.getLogger('integration.client');

let tape = require('tape');
let _test = require('tape-promise');
let test = _test(tape);
const path = require('path');
let FabricCAServices = require('../../fabric-ca-client');
const User = require('../../fabric-ca-client/lib/User');

let userOrg = 'org1';
let tlsOptions = {
	trustedRoots: [],
	verify: false
};
const caName = 'ca-org1';
let ORGS;

function checkResponse(response, info, t) {
	t.equal(response.success, true, 'Response should have property \'success\' equals true');
	t.equal(response.result.caname, caName, `Response should have property 'caname' equals ${caName}`);
	t.deepEqual(response.result.info, info, `Response should have property 'info' equals ${JSON.stringify(info)}`);
}

function checkExist(response, affiliation, t) {
	t.equal(response.success, true, 'Response should have property \'success\' equals true');
	let res = response.result.affiliations.find((path)=>{
		if (path.name === affiliation) {
			return true;
		}
	});

	if (res && res.name === affiliation) {
		t.pass(`affiliation ${affiliation} exists at ca ${response.result.caname}`);
	} else {
		t.fail(`affiliation ${affiliation} does not exists`);
		t.end();
	}
}

function checkNotExist(response, affiliation, t) {
	t.equal(response.success, true, 'Response should have property \'success\' equals true');
	let res = response.result.affiliations.find((path)=>{
		if (path.name === affiliation) {
			return true;
		}
	});

	if (res && res.name === affiliation) {
		t.fail(`affiliation ${affiliation} exists at ca ${response.result.caname}`);
		t.end();
	} else {
		t.pass(`affiliation ${affiliation} does not exists`);
	}
}

test('\n\n ** HFCAIdentityService Test **\n\n', (t) => {

	FabricCAServices.addConfigFile(path.join(__dirname, 'e2e', 'config.json'));
	ORGS = FabricCAServices.getConfigSetting('test-network');

	let fabricCAEndpoint = ORGS[userOrg].ca.url;

	FabricCAServices.getConfigSetting('crypto-keysize', '256'); //force for gulp test
	FabricCAServices.setConfigSetting('crypto-hash-algo', 'SHA2'); //force for gulp test

	const caService = new FabricCAServices(fabricCAEndpoint, tlsOptions, ORGS[userOrg].ca.name);

	const bootstrapUser = {
		enrollmentID: 'admin',
		enrollmentSecret: 'adminpw',
	};
	const newAffiliationRequest = {
		name: 'org2.office1',
	};
	const updatedAffiliation = {
		name: 'org2.office2',
	};

	// If any of the parent affiliations do not exist, create all parent affiliations also
	const forceCreateAffiliationRequest = {
		name: 'org3.department1',
		force: true,
	};

	// force update org3 to org4, so all children of org3 should be updated also
	const forceUpdatedAffiliation = {
		name: 'org4',
		force: true,
	}

	// If there are any child affiliations or any identities are associated with
	// this affiliation or child affiliations, force causes these identities and
	// child affiliations to be deleted; otherwise, an error is returned
	const forceDeleteAffiliationRequest = {
		name: 'org4',
		force: true,
	};

	let admin;
	let affiliationService;

	caService.enroll(bootstrapUser)
		.then((enrollment) => {
			t.pass('Successfully enrolled \'' + bootstrapUser.enrollmentID + '\'.');
			admin = new User('admin');
			return admin.setEnrollment(enrollment.key, enrollment.certificate, 'Org1MSP');
		}).then(() => {
			t.pass('Successfully set enrollment for user admin');
			affiliationService = caService.newAffiliationService();

			// get all affiliations with admin
			return affiliationService.getAll(admin);
		}).then((resp) => {
			t.equal(resp.success, true);
			t.equal(resp.result.caname, 'ca-org1');
			checkExist(resp, 'org1', t);
			checkExist(resp, 'org2', t);
			checkExist(resp, 'org1.department1', t);
			checkExist(resp, 'org1.department2', t);
			checkExist(resp, 'org2.department1', t);
			t.equal(resp.result.affiliations.length, 5);
			t.pass('Successfully get All afflitions from fabric-ca');

			return affiliationService.create(newAffiliationRequest, admin);
		}).then((resp) => {
			t.equal(resp.success, true);
			t.deepEqual(resp.result.info, newAffiliationRequest);
			t.pass(`Successfully created new affiliation ${newAffiliationRequest.name}`);

			return affiliationService.create(forceCreateAffiliationRequest, admin);
		}).then((resp) => {
			checkResponse(resp, {name: forceCreateAffiliationRequest.name}, t);
			t.pass(`Successfully force created new affiliation ${forceCreateAffiliationRequest.name}`);

			return affiliationService.getOne(newAffiliationRequest.name, admin);
		}).then((resp) => {
			checkResponse(resp, {name: newAffiliationRequest.name}, t);
			t.pass(`Successfully get affiliation ${newAffiliationRequest.name}`);

			return affiliationService.update('org2.office1', updatedAffiliation, admin);
		}).then((resp) => {
			checkResponse(resp, undefined, t);
			t.pass(`Successfully updated affiliation ${newAffiliationRequest.name} to ${updatedAffiliation.name}`);

			return affiliationService.getAll(admin);
		}).then((resp) => {
			checkExist(resp, updatedAffiliation.name, t);
			checkNotExist(resp, newAffiliationRequest.name, t);
			t.pass(`After update, ${newAffiliationRequest.name} does not exist, and ${updatedAffiliation.name} exists`);

			return affiliationService.update('org3', forceUpdatedAffiliation, admin);
		}).then((resp) => {
			checkResponse(resp, undefined, t);
			t.pass(`Successfully force updated affiliation 'org3' to 'org4', now check all its children have been updated too`);

			return affiliationService.getAll(admin);
		}).then((resp) => {
			checkExist(resp, forceUpdatedAffiliation.name, t);
			checkExist(resp, 'org4.department1', t);
			checkNotExist(resp, forceCreateAffiliationRequest.name, t);
			checkNotExist(resp, 'org3', t);
			t.pass(`After force update, 'org3' has been renamed to 'org4', 'org3.department1' has been renamed to 'org4.department1'`);

			return affiliationService.delete(updatedAffiliation, admin);
		}).then((resp) => {
			checkResponse(resp, undefined, t);
			t.pass(`Successfully deleted affiliation ${updatedAffiliation.name}`);

			return affiliationService.delete(forceDeleteAffiliationRequest, admin);
		}).then((resp) => {
			checkResponse(resp, undefined, t);
			t.pass(`Successfully deleted affiliation ${forceDeleteAffiliationRequest.name}`);

			return affiliationService.getAll(admin);
		}).then((resp) => {
			checkNotExist(resp, 'org4', t);
			checkNotExist(resp, 'org4.department1', t);
			t.pass(`After force delete, 'org4' and all its child affiliations are deleted`);
			
			t.end();
		})
		.catch((e) => {
			t.fail(e.message);
			t.end();
		});
});