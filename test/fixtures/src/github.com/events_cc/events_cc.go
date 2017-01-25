/*
Copyright London Stock Exchange 2017 All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

		 http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/hyperledger/fabric/core/chaincode/shim"
)

// EventSender example simple Chaincode implementation
type EventSender struct {
}

// Init function
func (t *EventSender) Init(stub shim.ChaincodeStubInterface) ([]byte, error) {
	err := stub.PutState("noevents", []byte("0"))
	if err != nil {
		return nil, err
	}
	return nil, nil
}

// Invoke function
func (t *EventSender) invoke(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	if len(args) != 2 {
		return nil, errors.New("Incorrect number of arguments. Expecting 2")
	}
	b, err := stub.GetState("noevents")
	if err != nil {
		return nil, errors.New("Failed to get state")
	}
	noevts, _ := strconv.Atoi(string(b))

	tosend := "Event " + string(b) + args[1]
	eventName := "evtsender" + args[0]

	err = stub.PutState("noevents", []byte(strconv.Itoa(noevts+1)))
	if err != nil {
		return nil, err
	}

	err = stub.SetEvent(eventName, []byte(tosend))
	if err != nil {
		return nil, err
	}
	return nil, nil
}

// Clear State function
func (t *EventSender) clear(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	err := stub.PutState("noevents", []byte("0"))
	if err != nil {
		return nil, err
	}
	return nil, nil
}

// Query function
func (t *EventSender) query(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	b, err := stub.GetState("noevents")
	if err != nil {
		return nil, errors.New("Failed to get state")
	}
	return b, nil
}

func (t *EventSender) Invoke(stub shim.ChaincodeStubInterface) ([]byte, error) {
	function, args := stub.GetFunctionAndParameters()

	if function != "invoke" {
		return nil, errors.New("Unknown function call")
	}

	if args[0] == "invoke" {
		return t.invoke(stub, args)
	} else if args[0] == "query" {
		return t.query(stub, args)
	} else if args[0] == "query" {
		return t.clear(stub, args)
	}

	return nil, errors.New("Invalid invoke function name. Expecting \"invoke\" \"query\"")
}

func main() {
	err := shim.Start(new(EventSender))
	if err != nil {
		fmt.Printf("Error starting EventSender chaincode: %s", err)
	}
}
