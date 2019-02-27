#
# SPDX-License-Identifier: Apache-2.0
#

@networkAPI
@clean-gateway
Feature: Listen to block events using a contract
	Background:
		Given I have deployed a tls Fabric network
		And I have created and joint all channels from the tls common connection profile
		And I have created a gateway named test_gateway as user User1 within Org1 using the tls common connection profile

	Scenario: Using a Contract I can listen to block events emmited by networks
		Given I install/instantiate node chaincode named events at version 1.0.0 as events02 to the tls Fabric network for all organizations on channel mychannel with endorsement policy 1AdminOr2Other and args [initLedger]
		When I use the gateway named test_gateway to listen for block_events with listener blockListener on chaincode events02 instantiated on channel mychannel
		When I use the gateway named test_gateway to submit a transaction with args [createValue] for chaincode events02 instantiated on channel mychannel
		Then I receive 2 events from the listener blockListener
