/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

export enum Constants {
	// Timeouts and steps
	HUGE_TIME  = 'HUGE_TIME',
	INC_LONG   = 'INC_LONG',
	INC_MED    = 'INC_MED',
	INC_SHORT  = 'INC_SHORT',
	STEP_LONG  = 'STEP_LONG',
	STEP_MED   = 'STEP_MED',
	STEP_SHORT = 'STEP_SHORT',

	// Fabric state
	FABRIC_STATE = 'FABRIC_STATE',

	// Known channels
	CREATED_CHANNELS = 'CREATED_CHANNELS',
	JOINED_CHANNELS = 'JOINT_CHANNELS',

	// Installed smart contracts
	INSTALLED_SC = 'INSTALLED_SC',
	INSTANTIATED_SC = 'INSTANTIATED_SC',

	// Default container for use in certain CLI actions
	DEFAULT_CLI_CONTAINER = 'org1',

	// Default Org for testing
	DEFAULT_ORG = 'Org1',

	// CLI command versosity (true/false)
	CLI_VERBOSITY = 'false',

	// Constants for network model actions
	WALLET = 'wallet',		// StateStore key to retrieve a wallet that contains users
	GATEWAYS = 'gateways',	// StateStore key to retrieve a Map(gatewayName, Gateway) of gateways that may be re-used
}
