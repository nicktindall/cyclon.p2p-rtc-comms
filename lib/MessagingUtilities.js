'use strict';

var Promise = require("bluebird");
var Utils = require("cyclon.p2p").Utils;

function MessagingUtilities(asyncExecService, loggingService) {

    Utils.checkArguments(arguments, 2);

    /**
     * Wait an amount of time for a particular type of message on a data channel
     *
     * @param messageType
     * @param dataChannel
     * @param timeoutMilliseconds
     * @param sourcePointer
     */
    this.waitForChannelMessage = function (messageType, dataChannel, timeoutMilliseconds, sourcePointer) {

        var timeoutTimerId = null;

        return new Promise(function (resolve, reject) {

            if ("open" !== String(dataChannel.readyState)) {
                reject(new Error("Data channel must be in 'open' state to receive " + messageType + " message"));
            }

            //
            // Setup message handler
            //
            dataChannel.onmessage = function (channelMessage) {

                try {
                    var parsedMessage = parseMessage(channelMessage.data, sourcePointer);
                    if (parsedMessage.type === messageType) {
                        //
                        // Remove the listener, clear the timeout timer
                        //
                        dataChannel.onmessage = null;
                        asyncExecService.clearTimeout(timeoutTimerId);
                        resolve(parsedMessage);
                    }
                    else {
                        loggingService.error("Unknown message received: " + channelMessage.data);
                    }
                }
                catch (parseError) {
                    loggingService.error("Invalid message received from " + sourcePointer.id + ": " + channelMessage.data);
                }
            };

            //
            // Start timeout timer
            //
            timeoutTimerId = asyncExecService.setTimeout(function () {
                dataChannel.onmessage = null;
                reject(new Promise.TimeoutError("Timeout reached waiting for '" + messageType + "' message (from " + sourcePointer.id + ")"));
            }, timeoutMilliseconds);
        }).cancellable().catch(Promise.CancellationError, function (e) {

                //
                // If cancel is called, clear the timeout timer
                //
                asyncExecService.clearTimeout(timeoutTimerId);
                throw e;
            });
    };

    /**
     * Parse a received message
     *
     * @param message
     * @param fromNode
     * @returns {*}
     */
    function parseMessage(message, fromNode) {
        try {
            return JSON.parse(message);
        }
        catch (e) {
            throw new Error("Bad message received from " + fromNode.id + " : '" + message + "'");
        }
    }
}

module.exports = MessagingUtilities;