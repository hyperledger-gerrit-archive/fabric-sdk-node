#
# SPDX-License-Identifier: Apache-2.0
#

@debug
#@clean-images

Feature: Configure Fabric using SDK and endorse and commit and query using a fabric-base

	Background:
#		Given I have forcibly taken down all docker containers
#	 	Given I have deployed a tls Fabric network
#		Given I have created fabric-client network instances
#		Then I can create and join a version_two capabilities channel named tokenchannel to two organizations
#		And I can package node chaincode at version v1 named example_cc_node as organization org1 with goPath na located at ../../../../test/fixtures/chaincode/node_cc/example_cc and metadata located at ../../../../test/fixtures/chaincode/metadata
#		And I can package node chaincode at version v1 named example_cc_node as organization org2 with goPath na located at ../../../../test/fixtures/chaincode/node_cc/example_cc and metadata located at ../../../../test/fixtures/chaincode/metadata
#		And I can install node chaincode at version v1 named example_cc_node as organization org1
#		And I can install node chaincode at version v1 named example_cc_node as organization org2
#		And I can approve node chaincode at version v1 named example_cc_node as organization org1 on channel tokenchannel with endorsement policy both_orgs
#		And I can approve node chaincode at version v1 named example_cc_node as organization org2 on channel tokenchannel with endorsement policy both_orgs
#		And I can commit node chaincode at version v1 named example_cc_node as organization org1 on channel tokenchannel
#		And I sleep to wait for all peers to catch up
#		And I can call init on chaincode named example_cc_node as organization org1 on channel tokenchannel with args ["a","1000","b","2000"]

 	Scenario: Using only fabric-base I can endorse and commit transactions on instantiated node chaincode
#		Given I use only base to call move on v1 of chaincode example_cc_node as organization org1 on channel tokenchannel with args ["a","b","100"]
		Given I use base to call discovery on peer1
#		Then I use only base to query on chaincode named example_cc_node as organization org1 on channel tokenchannel with args ["a"]
