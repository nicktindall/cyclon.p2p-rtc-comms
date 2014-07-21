'use strict';

var Promise = require("bluebird");
var Utils = require("cyclon.p2p").Utils;

function WebRTCComms(rtc, shuffleStateFactory, logger) {

    Utils.checkArguments(arguments, 3);

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
        rtc.join(localNode);
        rtc.onChannel("cyclonShuffle", this.handleIncomingShuffle);
        rtc.on("incomingTimeout", function(channelType, sourcePointer) {
            if(channelType === "cyclonShuffle") {
                console.warn("Emitting timeout from RTC event!");
                localNode.emit("shuffleTimeout", "incoming", sourcePointer);
            }
        });
        rtc.on("incomingError", function(channelType, sourcePointer, error) {
            if(channelType === "cyclonShuffle") {
                localNode.emit("shuffleError", "incoming", sourcePointer, error);
            }
        });
        rtc.on("offerReceived", function(channelType, sourcePointer) {
            if(channelType === "cyclonShuffle") {
                logger.debug("Incoming shuffle starting with " + sourcePointer.id);
                localNode.emit("shuffleStarted", "incoming", sourcePointer);
            }
        });
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
        currentOutgoingShuffle = createOutgoingShuffle(
            shuffleStateFactory.createOutgoingShuffleState(fromNode, destinationNodePointer, shuffleSet),
            destinationNodePointer);

        return currentOutgoingShuffle;
    };

    function createOutgoingShuffle(outgoingState, destinationNodePointer) {
        return rtc.openChannel("cyclonShuffle", destinationNodePointer)
            .then(outgoingState.storeChannel)
            .then(outgoingState.sendShuffleRequest)
            .then(outgoingState.processShuffleResponse)
            .then(outgoingState.sendResponseAcknowledgement)
            .cancellable()
            .catch(Promise.CancellationError, function (e) {
                outgoingState.cancel();
                throw e;
            })
            .finally(function() {
                outgoingState.close();
                outgoingState = null;
            });
    };

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
            signallingServers: rtc.getSignallingInfo()
        };
    };

    /**
     * Handle an incoming shuffle
     */
    this.handleIncomingShuffle = function (channel) {
        var remotePeer = channel.getRemotePeer();

        var incomingShuffleState = shuffleStateFactory.createIncomingShuffleState(localNode, remotePeer);

        return incomingShuffleState.processShuffleRequest(channel)
            .then(incomingShuffleState.waitForResponseAcknowledgement)
            .then(function() {
                localNode.emit("shuffleCompleted", "incoming", remotePeer);
            })
            .catch(Promise.TimeoutError, function (e) {
                logger.warn(e.message);
                localNode.emit("shuffleTimeout", "incoming", remotePeer);
            })
            .catch(function (error) {
                logger.error("An unknown error occurred on an incoming shuffle", error);
                localNode.emit("shuffleError", "incoming", remotePeer, "unknown");
            })
            .finally(function () {
                incomingShuffleState.close();
                channel.close();
            });
    };
}

module.exports = WebRTCComms;
