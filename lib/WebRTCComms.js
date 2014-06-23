'use strict';

var Promise = require("bluebird");

function WebRTCComms(peerConnectionFactory, shuffleStateFactory, signallingService, logger) {

    var localNode = null;
    var currentOutgoingShuffle = null;
    var lastShuffleNode = null;

    /**
     * Initialize the Comms object
     *
     * @param node The local Cyclon node
     */
    this.initialize = function (node) {
        localNode = node;
        signallingService.initialize(node);
        signallingService.on("offer", this.handleOffer);
    };

    /**
     * Send a shuffle request to another node
     *
     * @param fromNode
     * @param destinationNodePointer
     * @param shuffleSet
     */
    this.sendShuffleRequest = function (fromNode, destinationNodePointer, shuffleSet) {

        if (currentOutgoingShuffle !== null && currentOutgoingShuffle.isPending()) {
            logger.warn("Previous outgoing request timed out (to " + lastShuffleNode.id + ")");
            currentOutgoingShuffle.cancel();
        }

        lastShuffleNode = destinationNodePointer;
        var offerConnection = peerConnectionFactory.createPeerConnection();
        var outgoingState = shuffleStateFactory.createOutgoingShuffleState(fromNode, destinationNodePointer, shuffleSet, signallingService);

        currentOutgoingShuffle = createOutgoingShuffle(offerConnection, outgoingState);
        return currentOutgoingShuffle;
    };

    /**
     * This encapsulates the whole outgoing process
     *
     * @param offerConnection
     * @param outgoingState
     * @returns {*}
     */
    function createOutgoingShuffle(offerConnection, outgoingState) {

        return offerConnection.createOffer()
            .then(offerConnection.waitForIceCandidates)
            .then(outgoingState.sendOffer)
            .then(outgoingState.waitForAnswer)
            .then(offerConnection.handleAnswer)
            .then(offerConnection.waitForChannelToOpen)
            .then(outgoingState.sendShuffleRequest)
            .then(outgoingState.processShuffleResponse)
            .then(outgoingState.sendResponseAcknowledgement)
            .cancellable()
            .catch(Promise.CancellationError, function (e) {
                offerConnection.cancel();
                outgoingState.cancel();
                throw e;
            })
            .finally(function () {
                offerConnection.close();
                outgoingState.close();
            });
    }

    /**
     * Get the data required for the node pointer
     *
     * it looks like;
     *      {signallingServers: [{
     *          socket: {
     *             server: "http://localhost:2222",
     *             socketResource: "custom/path/to/socket.io"
     *          },
     *          signallingApiBase: "http://localhost:2222/"
     *       }, ...]
     *      }
     */
    this.getPointerData = function () {
        return {
            signallingServers: signallingService.getSignallingInfo()
        };
    };

    /**
     * Handle an offer
     */
    this.handleOffer = function (message) {
        logger.debug("Offer received from " + message.sourceId);
        localNode.emit("shuffleStarted", "incoming", message.sourcePointer);

        var answerConnection = peerConnectionFactory.createPeerConnection();
        var incomingShuffleState = shuffleStateFactory.createIncomingShuffleState(localNode, answerConnection, message.sourcePointer, signallingService);

        return answerConnection.createAnswer(message.sessionDescription, message.iceCandidates)
            .then(answerConnection.waitForIceCandidates)
            .then(incomingShuffleState.sendAnswer)
            .then(answerConnection.waitForChannelEstablishment)
            .then(answerConnection.waitForChannelToOpen)
            .then(incomingShuffleState.processShuffleRequest)
            .then(incomingShuffleState.waitForResponseAcknowledgement)
            .then(function() {
                localNode.emit("shuffleCompleted", "incoming", message.sourcePointer);
            })
            .finally(function () {
                answerConnection.close();
                incomingShuffleState.close();
            })
            .catch(Promise.TimeoutError, function (e) {
                logger.warn(e.message);
                localNode.emit("shuffleTimeout", "incoming", message.sourcePointer);
            })
            .catch(function (error) {
                logger.error("An unknown error occurred on an incoming shuffle", error);
                localNode.emit("shuffleError", "incoming", message.sourcePointer, "unknown");
            });

    };
}

module.exports = WebRTCComms;