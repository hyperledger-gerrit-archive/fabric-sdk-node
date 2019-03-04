#
# SPDX-License-Identifier: Apache-2.0
#

@networkAPI
@clean-gateway
Feature: Listen to transation events using a contract
	Background:
		Given I have deployed a tls Fabric network
		And I have created and joint all channels from the tls common connection profile
		And I have created a gateway named test_gateway as user User1 within Org1 using the tls common connection profile

	Scenario: I can listen to a transaction commit event
		Given I install/instantiate node chaincode named events at version 1.0.0 as events03 to the tls Fabric network for all organizations on channel mychannel with endorsement policy 1AdminOr2Other and args [initLedger]
		When I use the gateway named test_gateway to create a transaction named transaction1 that calls createValue using chaincode events03 instantiated on channel mychannel
		When I use the transaction named transaction1 to create a commit listener called transaction1Listener
		When I use the transaction named transaction1 to submit a transaction with args []
		Then I receive 1 events from the listener transaction1Listener

