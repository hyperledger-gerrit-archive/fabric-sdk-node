#
# SPDX-License-Identifier: Apache-2.0
#

@debug
@clean-images

Feature: Use the v2.0 chaincode lifecycle process

	Background:
		Given I have forcibly taken down all docker containers

	Scenario: Using the SDK I can run new chaincode
		Given I have deployed a tls Fabric network
		Given I have created fabric-client network instances
		Then I can create and join a version_two capabilities channel named tokenchannel to two organizations
		And I can package node chaincode at version v1 named example_cc as organization org1 located at ../../../../test/fixtures/src/node_cc/example_cc and metadata located at ../../../../test/fixtures/metadata
		And I can package java chaincode at version v2 named example_cc as organization org1 located at ../../../../test/fixtures/src/node_cc/example_cc and metadata located at ../../../../test/fixtures/metadata
		And I can package golang chaincode at version v3 named example_cc as organization org1 located at github.com/example_cc and metadata located at ../../../../test/fixtures/metadata
	 	And I can install node chaincode at version v1 named example_cc as organization org1
	 	And I can install java chaincode at version v2 named example_cc as organization org1
	 	And I can install golang chaincode at version v3 named example_cc as organization org1
#		And I can install node chaincode at version 1.0.0 named example_cc to the tls Fabric network as organization Org2 on channel tokenchannel
#	 	And I can approve node chaincode at version 1.0.0 named example_cc to the tls Fabric network as organization Org1 on channel tokenchannel with endorsement policy 2ofAny
#	 	And I can approve node chaincode at version 1.0.0 named example_cc to the tls Fabric network as organization Org2 on channel tokenchannel with endorsement policy 2ofAny
#	 	And I can commit node chaincode at version 1.0.0 named example_cc to the tls Fabric network as organization Org1 on channel tokenchannel
#	 	And I can initialize node chaincode named example_cc to the tls Fabric network as organization Org1 on channel tokenchannel args [init,a,1000,b,2000]
#	 	And I can invoke node chaincode named example_cc to the tls Fabric network as organization Org2 on channel tokenchannel args [move,a,b,100]