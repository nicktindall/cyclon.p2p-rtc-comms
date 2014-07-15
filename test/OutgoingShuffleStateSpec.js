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
        asyncExecService,
        loggingService,
        channel;

    var successCallback, failureCallback;

    var outgoingShuffleState;

    beforeEach(function () {
        successCallback = ClientMocks.createSuccessCallback();
        failureCallback = ClientMocks.createFailureCallback();

        localCyclonNode = ClientMocks.mockCyclonNode();
        asyncExecService = ClientMocks.mockAsyncExecService();
        loggingService = ClientMocks.mockLoggingService();
        channel = ClientMocks.mockChannel();

        //
        // Mock behaviours
        //
        asyncExecService.setTimeout.andReturn(TIMEOUT_ID);

        outgoingShuffleState = new OutgoingShuffleState(localCyclonNode, DESTINATION_NODE_POINTER, SHUFFLE_SET, asyncExecService, loggingService);
    });

    describe("after channel establishment", function() {

        beforeEach(function() {
            outgoingShuffleState.storeChannel(channel);
        });

        describe("when sending a shuffle request", function () {

            describe("and everything succeeds", function () {
                beforeEach(function () {
                    runs(function () {
                        asyncExecService.setTimeout.andCallFake(function (callback) {
                            callback();
                        });
                        outgoingShuffleState.sendShuffleRequest().then(successCallback).catch(failureCallback);
                    });

                    waits(10);
                });

                it("should set a timeout to send the message over the data channel", function () {
                    expect(channel.send).toHaveBeenCalledWith("shuffleRequest", SHUFFLE_SET);
                });

                it("should resolve", function () {
                    expect(failureCallback).not.toHaveBeenCalled();
                    expect(successCallback).toHaveBeenCalled();
                });
            });

            describe("and cancel is called before the request is sent", function () {
                beforeEach(function () {
                    runs(function () {
                        outgoingShuffleState.sendShuffleRequest().then(successCallback).catch(failureCallback).cancel();
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
                        channel.receive.andReturn(Promise.reject(timeoutError));
                        outgoingShuffleState.processShuffleResponse().then(successCallback).catch(failureCallback);
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
                        channel.receive.andReturn(Promise.resolve(RESPONSE_PAYLOAD));
                        outgoingShuffleState.processShuffleResponse().then(successCallback).catch(failureCallback);
                    });

                    waits(10);
                });

                it("should delegate to the local node to handle the response", function () {
                    expect(localCyclonNode.handleShuffleResponse).toHaveBeenCalledWith(DESTINATION_NODE_POINTER, RESPONSE_PAYLOAD);
                });

                it("should resolve with the channel", function () {
                    expect(successCallback).toHaveBeenCalled();
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
                        outgoingShuffleState.sendResponseAcknowledgement().then(successCallback).catch(failureCallback);
                    });

                    waits(10);
                });

                it("sends the acknowledgement over the channel", function () {
                    expect(channel.send).toHaveBeenCalledWith("shuffleResponseAcknowledgement");
                });

                it("resolves after a delay", function() {
                    expect(successCallback).toHaveBeenCalled();
                    expect(failureCallback).not.toHaveBeenCalled();
                });
            });

            describe("and cancel is called before the resolve happens", function() {
                beforeEach(function() {
                    runs(function() {
                        outgoingShuffleState.sendResponseAcknowledgement().then(successCallback).catch(failureCallback).cancel();
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

        describe("when closing", function() {

            var sendingRequestTimeoutId = "sendingRequestTimeoutId";
            var channelClosingTimeoutId = "channelClosingTimeoutId";

            beforeEach(function() {
                runs(function() {
                    asyncExecService.setTimeout.andReturn(sendingRequestTimeoutId);
                    outgoingShuffleState.sendShuffleRequest().then(successCallback).then(failureCallback);
                });

                waits(10);

                runs(function() {
                    asyncExecService.setTimeout.andReturn(channelClosingTimeoutId);
                    outgoingShuffleState.sendResponseAcknowledgement().then(successCallback).then(failureCallback);
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
                channel.receive.andReturn(lastOutstandingPromise);
                outgoingShuffleState.processShuffleResponse();
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
});
