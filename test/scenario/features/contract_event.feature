#
# SPDX-License-Identifier: Apache-2.0
#

@networkAPI
@clean-gateway
Feature: Listen to contract events using a contract
	Background:
		Given I have deployed a tls Fabric network
		And I have created and joint all channels from the tls common connection profile
		And I have created a gateway named test_gateway as user User1 within Org1 using the tls common connection profile

	Scenario: Using a Contract I can listen to contract events emmited by instantiated chaincodes
		Given I install/instantiate node chaincode named events at version 1.0.0 as events01 to the tls Fabric network for all organizations on channel mychannel with endorsement policy 1AdminOr2Other and args [initLedger]
		When I use the gateway named test_gateway to listen for create events with listener createValueListener on chaincode events01 instantiated on channel mychannel
		When I use the gateway named test_gateway to submit 5 transactions with args [createValue] for chaincode events01 instantiated on channel mychannel
		Then I receive 5 events from the listener createValueListener
		When I use the gateway named test_gateway to listen for dc events with listener ehDisconnectListener on chaincode events01 instantiated on channel mychannel
		When I use the gateway named test_gateway to submit 10 transactions with args [createValueDisconnect] for chaincode events01 instantiated on fabric channel mychannel disconnecting the event hub on listener ehDisconnectListener every 5 transactions
		Then I receive 10 events from the listener ehDisconnectListener
