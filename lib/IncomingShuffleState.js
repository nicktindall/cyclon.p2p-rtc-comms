'use strict';

var Utils = require("cyclon.p2p").Utils;
var Promise = require("bluebird");

function IncomingShuffleState(localNode, answerConnection, sourcePointer, signallingService, asyncExecService, logger, messagingUtilities) {

    Utils.checkArguments(arguments, 7);

    var SHUFFLE_REQUEST_TIMEOUT_MS = 15000;
    var SHUFFLE_RESPONSE_ACKNOWLEDGEMENT_TIMEOUT_MS = 15000;
    var lastOutstandingPromise = null;
    var responseSendingTimeoutId = null;

    /**
     * Receive an inbound shuffle
     *
     * @param dataChannel
     */
    this.processShuffleRequest = function (dataChannel) {

        lastOutstandingPromise = messagingUtilities.waitForChannelMessage("shuffleRequest", dataChannel, SHUFFLE_REQUEST_TIMEOUT_MS, sourcePointer)
            .then(function (shuffleRequestMessage) {
                return new Promise(function (resolve) {
                    logger.debug("Received shuffle request from " + sourcePointer.id + " : " + JSON.stringify(shuffleRequestMessage));
                    var response = localNode.handleShuffleRequest(sourcePointer, shuffleRequestMessage.payload);

                    //
                    // Not sure why but responses seem to send more reliably with a small delay
                    // between receiving the request and sending the response. Without this
                    // the sender sometimes reports they never got the response!?
                    //
                    responseSendingTimeoutId = asyncExecService.setTimeout(function () {
                        dataChannel.send(JSON.stringify({type: "shuffleResponse", payload: response}));
                        logger.debug("Sent shuffle response to " + sourcePointer.id);
                        resolve(dataChannel);
                    }, 10);
                })
            }).cancellable().catch(Promise.CancellationError, function (e) {
                asyncExecService.clearTimeout(responseSendingTimeoutId);
                throw e;
            });

        return lastOutstandingPromise;
    };

    /**
     * Wait for an acknowledgment that our shuffle response
     * was received (to prevent prematurely closing the data channel)
     */
    this.waitForResponseAcknowledgement = function (dataChannel) {

        lastOutstandingPromise = messagingUtilities.waitForChannelMessage("shuffleResponseAcknowledgement", dataChannel, SHUFFLE_RESPONSE_ACKNOWLEDGEMENT_TIMEOUT_MS, sourcePointer)
            .catch(Promise.TimeoutError, function () {
                logger.warn("Timeout occurred waiting for response acknowledgement, continuing");
            });

        return lastOutstandingPromise;
    };

    /**
     * Send an answer using the signalling service
     *
     * @param localParams
     * @returns {Promise}
     */
    this.sendAnswer = function (localParams) {

        var lastOutstandingPromise = signallingService.sendAnswer(sourcePointer, localParams.sessionDescription, localParams.iceCandidates);
        return lastOutstandingPromise;
    };

    /**
     * Cleanup any resources
     */
    this.close = function () {
        asyncExecService.clearTimeout(responseSendingTimeoutId);
        lastOutstandingPromise = null;
        localNode = null;
        answerConnection = null;
        sourcePointer = null;
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

module.exports = IncomingShuffleState;