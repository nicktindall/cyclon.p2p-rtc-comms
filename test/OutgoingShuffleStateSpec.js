'use strict';

var Promise = require("bluebird");
var OutgoingShuffleState = require("../lib/OutgoingShuffleState");
var ClientMocks = require("./ClientMocks");

describe("The Outgoing ShuffleState", function () {

    var TIMEOUT_ID = 12345;
    var SHUFFLE_SET = ["a", "b", "c"];
    var DESTINATION_NODE_POINTER = {
        id: "OTHER_NODE_ID"
    };
    var RESPONSE_PAYLOAD = "RESPONSE_PAYLOAD";
    var LOCAL_SESSION_DESCRIPTION = "LOCAL_SESSION_DESCRIPTION";
    var LOCAL_ICE_CANDIDATES = ["a", "b", "c"];
    var LOCAL_PARAMETERS = {
        sessionDescription: LOCAL_SESSION_DESCRIPTION,
        iceCandidates: LOCAL_ICE_CANDIDATES
    };

    var localCyclonNode,
        signallingService,
        asyncExecService,
        offerConnection,
        dataChannel,
        loggingService,
        messagingUtilities;

    var successCallback, failureCallback;

    var outgoingShuffleState;

    beforeEach(function () {
        successCallback = ClientMocks.createSuccessCallback();
        failureCallback = ClientMocks.createFailureCallback();

        messagingUtilities = ClientMocks.mockMessagingUtilities();
        localCyclonNode = ClientMocks.mockCyclonNode();
        signallingService = ClientMocks.mockSignallingService();
        asyncExecService = ClientMocks.mockAsyncExecService();
        offerConnection = ClientMocks.mockPeerConnection();
        dataChannel = ClientMocks.mockRtcDataChannel();
        loggingService = ClientMocks.mockLoggingService();
        dataChannel.readyState = "open";

        //
        // Mock behaviours
        //
        asyncExecService.setTimeout.andReturn(TIMEOUT_ID);

        outgoingShuffleState = new OutgoingShuffleState(localCyclonNode, DESTINATION_NODE_POINTER, SHUFFLE_SET, signallingService, asyncExecService, loggingService, messagingUtilities);
    });

    describe("when sending a shuffle request", function () {

        describe("and everything succeeds", function () {
            beforeEach(function () {
                runs(function () {
                    asyncExecService.setTimeout.andCallFake(function (callback) {
                        callback();
                    });
                    outgoingShuffleState.sendShuffleRequest(dataChannel).then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("should set a timeout to send the message over the data channel", function () {
                expect(dataChannel.send).toHaveBeenCalledWith(JSON.stringify({type: "shuffleRequest", payload: SHUFFLE_SET}));
            });

            it("should resolve with the datachannel", function () {
                expect(failureCallback).not.toHaveBeenCalled();
                expect(successCallback).toHaveBeenCalledWith(dataChannel);
            });
        });

        describe("and cancel is called before the request is sent", function () {
            beforeEach(function () {
                runs(function () {
                    outgoingShuffleState.sendShuffleRequest(dataChannel).then(successCallback).catch(failureCallback).cancel();
                });
                waits(100);
            });

            it("clears the send request timeout", function () {
                expect(asyncExecService.clearTimeout).toHaveBeenCalledWith(TIMEOUT_ID);
            });

            it("rejects with a cancellation error", function () {
                expect(failureCallback).toHaveBeenCalledWith(jasmine.any(Promise.CancellationError));
                expect(successCallback).not.toHaveBeenCalled();
            });
        });
    });

    describe("when processing a shuffle response", function () {

        describe("and a response is not received before the timeout", function () {

            var timeoutError;

            beforeEach(function () {
                runs(function () {
                    timeoutError = new Promise.TimeoutError();
                    messagingUtilities.waitForChannelMessage.andReturn(Promise.reject(timeoutError));
                    outgoingShuffleState.processShuffleResponse(dataChannel).then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("should not attempt to handle a response", function () {
                expect(localCyclonNode.handleShuffleResponse).not.toHaveBeenCalled();
            });

            it("should call reject with the error", function () {
                expect(successCallback).not.toHaveBeenCalled();
                expect(failureCallback).toHaveBeenCalledWith(timeoutError);
            });
        });

        describe("and a response is received before timeout", function () {

            beforeEach(function () {
                runs(function () {
                    messagingUtilities.waitForChannelMessage.andReturn(Promise.resolve({payload: RESPONSE_PAYLOAD}));
                    outgoingShuffleState.processShuffleResponse(dataChannel).then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("should delegate to the local node to handle the response", function () {
                expect(localCyclonNode.handleShuffleResponse).toHaveBeenCalledWith(DESTINATION_NODE_POINTER, RESPONSE_PAYLOAD);
            });

            it("should resolve with the dataChannel", function () {
                expect(successCallback).toHaveBeenCalledWith(dataChannel);
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });
    });

    describe("when sending a response acknowledgement", function () {

        describe("and everything succeeds", function () {
            beforeEach(function () {
                runs(function () {
                    asyncExecService.setTimeout.andCallFake(function(callback) {
                        callback();
                    });
                    outgoingShuffleState.sendResponseAcknowledgement(dataChannel).then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("sends the acknowledgement over the channel", function () {
                expect(dataChannel.send).toHaveBeenCalledWith(JSON.stringify({type: "shuffleResponseAcknowledgement"}));
            });

            it("resolves after a delay", function() {
                expect(successCallback).toHaveBeenCalled();
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        describe("and cancel is called before the resolve happens", function() {
            beforeEach(function() {
                runs(function() {
                    outgoingShuffleState.sendResponseAcknowledgement(dataChannel).then(successCallback).catch(failureCallback).cancel();
                });

                waits(100);
            });

            it("clears the resolve timeout", function() {
                expect(asyncExecService.clearTimeout).toHaveBeenCalledWith(TIMEOUT_ID);
            });

            it("rejects with a cancellation error", function() {
                expect(failureCallback).toHaveBeenCalledWith(jasmine.any(Promise.CancellationError));
                expect(successCallback).not.toHaveBeenCalled();
            });
        });
    });

    describe("when waiting for an answer", function () {

        var answerHandler,
            promise;

        beforeEach(function() {
            runs(function() {
                signallingService.on.andCallFake(function(event, callback) {
                    answerHandler = callback;
                });
                promise = outgoingShuffleState.waitForAnswer().then(successCallback).catch(failureCallback);
            });

            waits(10);
        });

        it("registers a listener for answer events on the signalling service", function() {
            expect(signallingService.on).toHaveBeenCalledWith("answer", jasmine.any(Function));
        });

        describe("and an answer is received from the node we send the offer to", function() {

            var message = {sourceId: DESTINATION_NODE_POINTER.id};
            beforeEach(function() {
                runs(function() {
                    answerHandler(message);
                });

                waits(10);
            });

            it("removes the listener from the answer event", function() {
                expect(signallingService.removeListener).toHaveBeenCalledWith("answer", answerHandler);
            });

            it("resolves with the message", function() {
                expect(successCallback).toHaveBeenCalledWith(message);
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        describe("and an answer is received from another node", function() {

            var message = {sourceId: "some other ID"};
            beforeEach(function() {
                runs(function() {
                    answerHandler(message);
                });
            });

            it("ignores the message and logs a message", function() {
                expect(loggingService.debug).toHaveBeenCalled();
            });

            it("doesn't remove the listener", function() {
                expect(signallingService.removeListener).not.toHaveBeenCalled();
            });

            it("continues to wait for the answer", function() {
                expect(successCallback).not.toHaveBeenCalled();
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        describe("and cancel is called before the answer arrives", function() {
            beforeEach(function() {
                runs(function() {
                    promise.cancel();
                });

                waits(100);
            });

            it("removes the listener from the answer event", function() {
                expect(signallingService.removeListener).toHaveBeenCalledWith("answer", answerHandler);
            });

            it("rejects with a cancellation error", function() {
                expect(failureCallback).toHaveBeenCalledWith(jasmine.any(Promise.CancellationError));
                expect(successCallback).not.toHaveBeenCalled();
            });
        });
    });

    describe("when sending an offer", function () {

        beforeEach(function () {
            runs(function () {
                signallingService.sendOffer.andReturn(Promise.resolve({}));
                outgoingShuffleState.sendOffer(LOCAL_PARAMETERS).then(successCallback).catch(failureCallback);
            });

            waits(10);
        });

        it("delegates to the signalling service to send the offer", function () {
            expect(signallingService.sendOffer).toHaveBeenCalledWith(DESTINATION_NODE_POINTER, LOCAL_SESSION_DESCRIPTION, LOCAL_ICE_CANDIDATES);
        });

        it("resolves", function () {
            expect(successCallback).toHaveBeenCalled();
            expect(failureCallback).not.toHaveBeenCalled();
        });
    });

    describe("when closing", function() {

        var sendingRequestTimeoutId = "sendingRequestTimeoutId";
        var channelClosingTimeoutId = "channelClosingTimeoutId";

        beforeEach(function() {
            runs(function() {
                asyncExecService.setTimeout.andReturn(sendingRequestTimeoutId);
                outgoingShuffleState.sendShuffleRequest(dataChannel).then(successCallback).then(failureCallback);
            });

            waits(10);

            runs(function() {
                asyncExecService.setTimeout.andReturn(channelClosingTimeoutId);
                outgoingShuffleState.sendResponseAcknowledgement(dataChannel).then(successCallback).then(failureCallback);
            });

            waits(10);

            runs(function() {
                outgoingShuffleState.close();
            });
        });

        it("clears the sending request timeout", function() {
            expect(asyncExecService.clearTimeout).toHaveBeenCalledWith(sendingRequestTimeoutId);
        });

        it("clears the channel closing timeout", function() {
            expect(asyncExecService.clearTimeout).toHaveBeenCalledWith(channelClosingTimeoutId);
        });
    });

    describe("when cancelling", function() {

        var lastOutstandingPromise;

        beforeEach(function() {
            lastOutstandingPromise = ClientMocks.mockPromise();
            signallingService.sendOffer.andReturn(lastOutstandingPromise);
            outgoingShuffleState.sendOffer(LOCAL_PARAMETERS);
        });

        describe("and the last outstanding promise is pending", function() {
            beforeEach(function() {
                lastOutstandingPromise.isPending.andReturn(true);
                outgoingShuffleState.cancel();
            });

            it("cancels the latest outstanding promise", function() {
                expect(lastOutstandingPromise.cancel).toHaveBeenCalled();
            });
        });

        describe("and the last outstanding promise is not pending", function() {
            beforeEach(function() {
                lastOutstandingPromise.isPending.andReturn(false);
                outgoingShuffleState.cancel();
            });

            it("doesn't cancel the latest outstanding promise", function() {
                expect(lastOutstandingPromise.cancel).not.toHaveBeenCalled();
            });
        });
    });
});