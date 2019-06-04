#
# SPDX-License-Identifier: Apache-2.0
#

@debug
#@clean-images

Feature: Configure Fabric using SDK and endorse and commit and query using a fabric-base

	Background:
		Given I have deployed a tls Fabric network
		And I have created and joint all channels from the tls common connection profile
		And I update channel with name mychannel with config file mychannel-org1anchor.tx from the tls common connection profile
		And I install/instantiate node chaincode named fabcar at version 1.0.0 as fabcar01 to the tls Fabric network for all organizations on channel mychannel with endorsement policy 1AdminOr2Other and args [initLedger]


 	Scenario: Using only fabric-base I can discover, query, endorse and commit transactions on instantiated node chaincode
		Given endorse chaincode fabcar01 channel mychannel args ["createCar","2000","GMC","Savana","grey","Jones"]
		Then discovery on channel mychannel chaincode fabcar01
		Then discovery endorse chaincode fabcar01 channel mychannel args ["createCar","2001","GMC","Savana","grey","Jones"]
#		Then I use only base to query on chaincode named example_cc_node as organization org1 on channel mychannel with args ["a"]
