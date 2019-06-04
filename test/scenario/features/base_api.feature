#
# SPDX-License-Identifier: Apache-2.0
#

@debug
#@clean-images

Feature: Configure Fabric using SDK and endorse and commit and query using a fabric-base

	Background:

 	Scenario: Using only fabric-base I can endorse and commit transactions on instantiated node chaincode
		Given I use only base to call move on chaincode example_cc_node as organization org1 on channel tokenchannel with args ["a","b","100"]
		Then I use base to call discovery on peer1
		Then I use base to call discovery on peer1 to endorse
#		Then I use only base to query on chaincode named example_cc_node as organization org1 on channel tokenchannel with args ["a"]
