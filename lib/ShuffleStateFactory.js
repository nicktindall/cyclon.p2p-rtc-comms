'use strict';

var IncomingShuffleState = require("./IncomingShuffleState");
var OutgoingShuffleState = require("./OutgoingShuffleState");

var Utils = require("cyclon.p2p").Utils;

function ShuffleStateFactory(loggingService, asyncExecService, messagingUtilities) {

    Utils.checkArguments(arguments, 3);

    /**
     * Create a new outgoing shuffle state
     *
     * @param localNode The local Cyclon node
     * @param destinationNodePointer The pointer to the destination node
     * @param shuffleSet The set of node pointers to send in the request
     * @param signallingService
     * @returns {OutgoingShuffleState}
     */
    this.createOutgoingShuffleState = function (localNode, destinationNodePointer, shuffleSet, signallingService) {
        return new OutgoingShuffleState(localNode, destinationNodePointer, shuffleSet, signallingService, asyncExecService, loggingService, messagingUtilities);
    };

    /**
     * Create a new incoming shuffle state
     *
     * @param localNode The local Cyclon node
     * @param answerConnection The RTCDataConnection to the peer
     * @param sourcePointer The source peer's node pointer
     * @param signallingService
     * @returns {IncomingShuffleState}
     */
    this.createIncomingShuffleState = function (localNode, answerConnection, sourcePointer, signallingService) {
        return new IncomingShuffleState(localNode, answerConnection, sourcePointer, signallingService, asyncExecService, loggingService, messagingUtilities);
    };
}

module.exports = ShuffleStateFactory;