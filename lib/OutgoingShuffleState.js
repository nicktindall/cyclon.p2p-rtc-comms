'use strict';

var Promise = require("bluebird");
var Utils = require("cyclon.p2p").Utils;

function OutgoingShuffleState(fromNode, destinationNodePointer, shuffleSet, signallingService, asyncExecService, logger, messagingUtilities) {

    Utils.checkArguments(arguments, 7);

    var SHUFFLE_RESPONSE_TIMEOUT_MS = 30000;
    var lastOutstandingPromise = null;
    var channelClosingTimeoutId = null;
    var sendingRequestTimeoutId = null;

    /**
     * Send a shuffle request
     *
     * @returns {Promise}
     */
    this.sendShuffleRequest = function (rtcDataChannel) {

        lastOutstandingPromise = new Promise(function (resolve) {

            /**
             * We need to delay the sending of the request because the messages seem to go missing when sent
             * immediately on the RTCDataChannel.onopen event, and even seem a bit flaky when only a short
             * delay (e.g. 1ms) is implemented. Not sure how long we need to wait, but 1 second seems
             * to reduce the number of lost messages to a negligible level.
             */
            sendingRequestTimeoutId = asyncExecService.setTimeout(function () {
                rtcDataChannel.send(JSON.stringify({type: "shuffleRequest", payload: shuffleSet}));
                logger.debug("Sent shuffle request to " + destinationNodePointer.id + " : " + JSON.stringify(shuffleSet));
                resolve(rtcDataChannel);
            }, 1000);
        }).cancellable()
            .catch(Promise.CancellationError, function (e) {
                asyncExecService.clearTimeout(sendingRequestTimeoutId);
                throw e;
            });

        return lastOutstandingPromise;
    };

    /**
     * Receive and process a shuffle response
     */
    this.processShuffleResponse = function (rtcDataChannel) {

        lastOutstandingPromise = messagingUtilities.waitForChannelMessage("shuffleResponse", rtcDataChannel, SHUFFLE_RESPONSE_TIMEOUT_MS, destinationNodePointer)
            .then(function (shuffleResponseMessage) {
                return new Promise(function (resolve) {
                    logger.debug("Received shuffle response from " + destinationNodePointer.id + " : " + JSON.stringify(shuffleResponseMessage));
                    fromNode.handleShuffleResponse(destinationNodePointer, shuffleResponseMessage.payload);
                    resolve(rtcDataChannel);
                });
            }).cancellable();

        return lastOutstandingPromise;
    };

    /**
     * Send an acknowledgement we received the response
     */
    this.sendResponseAcknowledgement = function (dataChannel) {

        lastOutstandingPromise = new Promise(function (resolve) {
            dataChannel.send(JSON.stringify({type: "shuffleResponseAcknowledgement" }));

            //
            // Delay closing connection to allow acknowledgement to be sent (?)
            //
            channelClosingTimeoutId = asyncExecService.setTimeout(function () {
                resolve();
            }, 3000);
        }).cancellable().catch(Promise.CancellationError, function (e) {
                asyncExecService.clearTimeout(channelClosingTimeoutId);
                throw e;
            });

        return lastOutstandingPromise;
    };

    /**
     * Wait for an answer from the current outgoing person
     *
     * @returns {Promise}
     */
    this.waitForAnswer = function () {

        var answerHandler;
        lastOutstandingPromise = new Promise(function (resolve) {

            answerHandler = function (message) {
                if (message.sourceId === destinationNodePointer.id) {
                    signallingService.removeListener("answer", answerHandler);
                    resolve(message);
                }
                else {
                    logger.debug("Late answer received from " + message.sourceId);
                }
            };

            signallingService.on("answer", answerHandler);
        }).cancellable().catch(Promise.CancellationError, function (e) {
                signallingService.removeListener("answer", answerHandler);
                throw e;
            });

        return lastOutstandingPromise;
    };

    /**
     * Send an offer to the other peer using the signalling service
     *
     * @param localParams
     * @returns {Promise}
     */
    this.sendOffer = function (localParams) {

        lastOutstandingPromise = signallingService.sendOffer(destinationNodePointer, localParams.sessionDescription, localParams.iceCandidates);
        return lastOutstandingPromise;
    };

    /**
     * Cleanup any resources
     */
    this.close = function () {

        asyncExecService.clearTimeout(sendingRequestTimeoutId);
        asyncExecService.clearTimeout(channelClosingTimeoutId);
        lastOutstandingPromise = null;
        fromNode = null;
        destinationNodePointer = null;
        shuffleSet = null;
    };

    /**
     * Cancel any currently outstanding promises
     */
    this.cancel = function () {

        if (lastOutstandingPromise !== null && lastOutstandingPromise.isPending()) {
            lastOutstandingPromise.cancel();
        }
    }
}


module.exports = OutgoingShuffleState;