/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, Endorser, User } from 'fabric-common';
import { Action, ActionOptions} from '../../../src/action';

export interface ChaincodeOptions extends ActionOptions{
	readonly name: string;
	readonly version: string;
}

/**
 * The base administrative class for chaincode lifecycle functions.
 * @memberof module:fabric-admin
 */
export class Chaincode extends Action implements Chaincode, ChaincodePackage, ChaincodeApprove {
	public name: string = '';
	public version: string = '';


	/**
	 * Create a chaincode instance used to manage a chaincode on a fabric network.
	 * @param {module:fabric-base.Client} client - network view and connection information.
	 * @param {module:fabric-base.User} user - identity to be used for network request.
	 */
	public constructor(client: Client, user: User, options: ChaincodeOptions) {
		super(client, user, options);
		this.set(options);
	}

	/**
	 * Apply the provided settings to this chaincode instance
	 * @param {ChaincodeOptions} options - The chaincode settings
	 */
	public set(options: ChaincodeOptions) {
		if (options.name) {
			this.name = options.name;
		}
		if (options.version) {
			this.version = options.version;
		}

		return this;
	}

	/**
	 * Package a chaincode. Takes the chaincode source files and builds a
	 * tar file with files in the layout required by the fabric network to
	 * be installed.
	 * @param {string} path - The location of the source files.
	 * @returns {Promise<ChaincodePackage>}
	 */
	public async package(path: string): Promise<ChaincodePackage> {
		return this;
	}

	public async install(target: Endorser): Promise<ChaincodeApprove> {
		return this;
	}
}

/**
 * The administrative class for chaincode install step.
 * @memberof module:fabric-admin
 */
export interface ChaincodeDefinition {
	package(path: string): Promise<ChaincodePackage>;
}
export interface ChaincodePackage extends Chaincode {
	install(target: Endorser): Promise<ChaincodeApprove>;
}
export interface ChaincodeApprove extends Chaincode {
}