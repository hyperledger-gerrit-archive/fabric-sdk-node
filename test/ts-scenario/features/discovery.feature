#
# SPDX-License-Identifier: Apache-2.0
#

@clean-gateway
@discovery
Feature: Configure Fabric using CLI and submit/evaluate using a network Gateway with discovery

	Background:
	 	Given I deploy a tls Fabric network
	 	And I use the cli to create and join the channel named discovery on the deployed network
		And I use the cli to update the channel with name discovery with config file discovery-anchor.tx on the deployed network
		And I use the cli to deploy a node smart contract named fabcar at version 1.0.0 for all organizations on channel discovery with endorsement policy 1of and arguments ["initLedger"]

 	Scenario: Using a Gateway I can submit and evaluate transactions on instantiated node smart contract
		Given I have a gateway named myDiscoveryGateway with discovery set to true for user User1 using the connection profile named ccp-tls.json
	    When I use the gateway named myDiscoveryGateway to submit a transaction with args [createCar,1001,Ariel,Atom,red,Nick] for contract fabcar instantiated on channel discovery
	    Then The gateway named myDiscoveryGateway has a submit type response
	 	When I use the gateway named myDiscoveryGateway to evaluate a transaction with args [queryCar,1001] for contract fabcar instantiated on channel discovery
	 	Then The gateway named myDiscoveryGateway has a evaluate type response matching "{\"color\":\"red\",\"docType\":\"car\",\"make\":\"Ariel\",\"model\":\"Atom\",\"owner\":\"Nick\"}"
