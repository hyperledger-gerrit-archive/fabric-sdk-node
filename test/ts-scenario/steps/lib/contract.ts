/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

import { Constants } from '../constants';
import * as BaseUtils from './utility/baseUtils';
import { CommandRunner } from './utility/commandRunner';

import * as path from 'path';
import { CommonConnectionProfile } from './utility/commonConnectionProfile';

const commandRunner = CommandRunner.getInstance();

// Policies to use
const ENDORSEMENT_POLICY_1OF_ANY = '"OR (\'Org1MSP.member\',\'Org2MSP.member\')"';
const ENDORSEMENT_POLICY_2OF_ANY = '"AND (\'Org1MSP.member\',\'Org2MSP.member\')"';

// CLI verbosity in commands
const VERBOSE_CLI = JSON.parse(Constants.CLI_VERBOSITY);

export async function cli_chaincode_install_for_org(ccType: string, ccName: string, ccVersion: string, orgName: string) {

	const persistName = `${ccName}@${ccVersion}`;

	try {
		// Use CLI container to install smart contract (no TLS options required)
		BaseUtils.logMsg(`Attempting to install smart contract ${persistName} for organization ${orgName} using the CLI`, undefined);

		const ccPath = path.join('/', 'opt', 'gopath', 'src', 'github.com', 'chaincode', ccType, ccName);
		let installCommand: string[];
		installCommand = [
			'docker', 'exec', `${orgName}_cli`, 'peer', 'chaincode', 'install',
			'-l', ccType,
			'-n', ccName,
			'-v', ccVersion,
			'-p', ccPath,
			'--connTimeout', Constants.CLI_TIMEOUT as string,
		];

		await commandRunner.runShellCommand(true, installCommand.join(' '), VERBOSE_CLI);
		await BaseUtils.sleep(Constants.INC_SHORT);
		BaseUtils.logMsg(`Smart contract ${persistName} has been installed for organization ${orgName} using the CLI`, undefined);
	} catch (err) {
		BaseUtils.logError(`Failed to install smart contract ${ccName} using the CLI`, err);
		return Promise.reject(err);
	}
}

export async function cli_chaincode_instantiate(ccType: string, ccName: string, ccVersion: string, initArgs: string, channelName: string, policy: string, tls: boolean) {
	try {
		// Use CLI container to instantiate smart contract
		const persistName = `${ccName}@${ccVersion}`;
		BaseUtils.logMsg(`Attempting to instantiate smart contract ${persistName} on channel ${channelName} with args ${initArgs} using default container ${Constants.DEFAULT_CLI_CONTAINER}`, undefined);

		let tlsOptions: string[];
		if (tls) {
			tlsOptions = ['--tls', 'true', '--cafile', '/etc/hyperledger/configtx/crypto-config/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem'];
		} else {
			tlsOptions = [];
		}

		let ccPolicy: string[];
		switch (policy) {
			case 'none':
				ccPolicy = [];
				break;
			case '1ofAny':
				ccPolicy = ['-P', ENDORSEMENT_POLICY_1OF_ANY];
				break;
			case '2ofAny':
				ccPolicy = ['-P', ENDORSEMENT_POLICY_2OF_ANY];
				break;
			default:
				// leave it blank and let fabric decide
				ccPolicy = [];
		}

		const ccArgs = `"{\\"Args\\": ${JSON.stringify(initArgs)}}"`;

		let instantiateCommand: string[];
		instantiateCommand = [
			'docker', 'exec', `${Constants.DEFAULT_CLI_CONTAINER}_cli`, 'peer', 'chaincode', 'instantiate',
			'-o', 'orderer.example.com:7050',
			'-l', ccType,
			'-C', channelName,
			'-n', ccName,
			'-v', ccVersion,
			'-c', ccArgs,
		];

		instantiateCommand = instantiateCommand.concat(ccPolicy);
		instantiateCommand = instantiateCommand.concat(tlsOptions);
		await commandRunner.runShellCommand(true, instantiateCommand.join(' '), VERBOSE_CLI);

		// Since using the CLI we should be sure that the chaincode has *actually* been instantiated before progressing from here
		const timeoutId = setTimeout(() => { throw new Error(`instantiate smart contract ${ccName} on channel ${channelName} exceeded the default timeout ${Constants.INSTANTIATE_TIMEOUT}ms`); }, Constants.INSTANTIATE_TIMEOUT);
		let deployed = false;
		while (!deployed) {
			const response = await cli_chaincode_list_instantiated(channelName) as string;
			if (response.includes(`Name: ${ccName}, Version: ${ccVersion}`)) {
				deployed = true;
			} else {
				BaseUtils.logMsg('Awaiting smart contract instantiation ...', undefined);
				await BaseUtils.sleep(Constants.INC_SHORT);
			}
		}
		clearTimeout(timeoutId);
		BaseUtils.logMsg(`Smart contract ${ccName} has been instantiated on channel ${channelName} using the CLI`, undefined);
	} catch (err) {
		BaseUtils.logError(`Failed to instantiate smart contract ${ccName} on channel ${channelName} using the CLI`, err);
		return Promise.reject(err);
	}
}

export async function cli_chaincode_list_instantiated(channelName: string) {
	const listInstantiatedCommand = [
		'docker', 'exec', `${Constants.DEFAULT_CLI_CONTAINER}_cli`, 'peer', 'chaincode', 'list',
		'-o', 'orderer.example.com:7050',
		'--instantiated',
		'-C', channelName,
	];

	const instantiated = await commandRunner.runShellCommand(true, listInstantiatedCommand.join(' '), VERBOSE_CLI) as any;
	return instantiated.stdout as string;
}

export async function cli_lifecycle_chaincode_query_installed(orgName: string) {
	const queryInstalledCommand = [
		'docker', 'exec', `${orgName}_cli`, 'peer', 'lifecycle', 'chaincode', 'queryinstalled',
	];

	const installed = await commandRunner.runShellCommand(true, queryInstalledCommand.join(' '), VERBOSE_CLI) as any;
	return installed.stdout as string;
}

export async function retrievePackageIdForLabelOnOrg(ccName: string, orgName: string) {
	const response = await cli_lifecycle_chaincode_query_installed(orgName);

	// Break into an array
	const responseArray = response.split('\n');

	for (const row of responseArray) {
		if (row.includes(`Label: ${ccName}`)) {
			// strip out the ID
			const segment = row.split(',')[0];
			return segment.substr(segment.lastIndexOf(' ') + 1) as string;
		}
	}

	// if it is not found in the above, throw
	BaseUtils.logAndThrow(`Unable to find packageId for contract ${ccName}`);
}

export async function cli_lifecycle_chaincode_package(ccType: string, ccName: string, ccVersion: string, orgName: string) {

	try {
		// Use CLI container to package smart contract (no TLS options required)
		BaseUtils.logMsg(`Attempting lifecyle package of smart contract ${ccName} for organization ${orgName} using the CLI`, undefined);

		const ccPath = path.join('/', 'opt', 'gopath', 'src', 'github.com', 'chaincode', ccType, ccName);
		let packageCommand: string[];
		packageCommand = [
			'docker', 'exec', `${orgName}_cli`, 'peer', 'lifecycle', 'chaincode', 'package',
			`${ccName}.tar.gz`,
			'--lang', ccType,
			'--label', ccName,
			'--path', ccPath,
		];

		await commandRunner.runShellCommand(true, packageCommand.join(' '), VERBOSE_CLI);
		await BaseUtils.sleep(Constants.INC_SHORT);
		BaseUtils.logMsg(`Smart contract ${ccName} has been packaged for organization ${orgName} using the CLI`, undefined);
		return 'bob';
	} catch (err) {
		BaseUtils.logError(`Failed to package smart contract ${ccName} using the CLI`, err);
		return Promise.reject(err);
	}
}

export async function cli_lifecycle_chaincode_install(ccName: string, orgName: string) {
	try {
		// Use CLI container to package smart contract (no TLS options required)
		BaseUtils.logMsg(`Attempting lifecycle install of smart contract ${ccName} for organization ${orgName} using the CLI`, undefined);

		let installCommand: string[];
		installCommand = [
			'docker', 'exec', `${orgName}_cli`, 'peer', 'lifecycle', 'chaincode', 'install',
			`${ccName}.tar.gz`,
			'--connTimeout', Constants.CLI_TIMEOUT as string,
		];

		await commandRunner.runShellCommand(true, installCommand.join(' '), VERBOSE_CLI);
		await BaseUtils.sleep(Constants.INC_SHORT);
		BaseUtils.logMsg(`Smart contract ${ccName} has been installed for organization ${orgName} using the CLI`, undefined);
	} catch (err) {
		BaseUtils.logError(`Failed to install smart contract ${ccName} using the CLI`, err);
		return Promise.reject(err);
	}
}

export async function cli_lifecycle_chaincode_approve(ccReference: string, ccVersion: string, orgName: string, channelName: string, packageId: string, sequence: string, tls: boolean) {
	try {
		// Use CLI container to package smart contract (no TLS options required)
		BaseUtils.logMsg(`Attempting lifecycle approve of smart contract with reference ${ccReference} for organization ${orgName} using the CLI`, undefined);

		let approveCommand: string[];
		approveCommand = [
			'docker', 'exec', `${orgName}_cli`, 'peer', 'lifecycle', 'chaincode', 'approveformyorg',
			'--channelID', channelName,
			'--name', ccReference,
			'--version', ccVersion,
			'--package-id', packageId,
			'--sequence', sequence,
			'--waitForEvent',
		];

		if (tls) {
			approveCommand.push('--tls', 'true', '--cafile', '/etc/hyperledger/configtx/crypto-config/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem');
		}

		await commandRunner.runShellCommand(true, approveCommand.join(' '), VERBOSE_CLI);
		await BaseUtils.sleep(Constants.INC_SHORT);
		BaseUtils.logMsg(`Smart contract with reference ${ccReference} has been approved for organization ${orgName} using the CLI`, undefined);
	} catch (err) {
		BaseUtils.logError(`Failed to approve smart contract with reference ${ccReference} using the CLI`, err);
		return Promise.reject(err);
	}
}

export async function cli_lifecycle_chaincode_commit(ccReference: string, ccVersion: string, orgName: string, channelName: string, ccp: CommonConnectionProfile, sequence: string, tls: boolean) {
	try {
		// Use CLI container to commit smart contract (no TLS options required)
		BaseUtils.logMsg(`Attempting lifecycle commit of smart contract with reference ${ccReference} for organization ${orgName} using the CLI`, undefined);

		const ordererName = ccp.getOrderersForChannel(channelName)[0];
		const ordererUrl = ccp.getOrderer(ordererName).url;
		const ordererPort = ordererUrl.substr(ordererUrl.lastIndexOf(':') + 1);
		const ordererHost = ccp.getOrderer(ordererName).grpcOptions['ssl-target-name-override'];

		// --peerAddresses
		const peerAddresses = 'peer0.org1.example.com:7051 peer0.org2.example.com:8051';
		//  --tlsRootCertFiles
		const tlsCerts = '/etc/hyperledger/config/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt /etc/hyperledger/config/crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt';
		let commitCommand: string[];
		commitCommand = [
			'docker', 'exec', `${orgName}_cli`, 'peer', 'lifecycle', 'chaincode', 'commit',
			'-o', `${ordererHost}:${ordererPort}`,
			'--channelID', channelName,
			'--name', ccReference,
			'--version', ccVersion,
			'--sequence', sequence,
			'--peerAddresses', peerAddresses,
			'--tlsRootCertFiles', tlsCerts,
			'--waitForEvent',
		];

		if (tls) {
			commitCommand.push('--tls', 'true', '--cafile', '/etc/hyperledger/configtx/crypto-config/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem');
		}

		await commandRunner.runShellCommand(true, commitCommand.join(' '), VERBOSE_CLI);
		await BaseUtils.sleep(Constants.INC_SHORT);
		BaseUtils.logMsg(`Smart contract with reference ${ccReference} has been committed for organization ${orgName} using the CLI`, undefined);
	} catch (err) {
		BaseUtils.logError(`Failed to commit smart contract with reference ${ccReference} using the CLI`, err);
		return Promise.reject(err);
	}
}
