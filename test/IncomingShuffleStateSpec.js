'use strict';

var Promise = require("bluebird");
var IncomingShuffleState = require("../lib/IncomingShuffleState.js");
var ClientMocks = require("./ClientMocks");

describe("The Incoming ShuffleState", function () {

    var SOURCE_POINTER = {id: "SOURCE_ID", age: 10};

    var LOCAL_SESSION_DESCRIPTION = "LOCAL_SESSION_DESCRIPTION";
    var LOCAL_ICE_CANDIDATES = ["a", "b", "c"];
    var LOCAL_PARAMETERS = {
        sessionDescription: LOCAL_SESSION_DESCRIPTION,
        iceCandidates: LOCAL_ICE_CANDIDATES
    };
    var REQUEST_PAYLOAD = "REQUEST_PAYLOAD";
    var RESPONSE_PAYLOAD = "RESPONSE_PAYLOAD";
    var TIMEOUT_ID = "TIMEOUT_ID";

    var localCyclonNode,
        asyncExecService,
        loggingService,
        successCallback,
        failureCallback,
        channel;

    var incomingShuffleState;

    beforeEach(function () {
        successCallback = ClientMocks.createSuccessCallback();
        failureCallback = ClientMocks.createFailureCallback();

        localCyclonNode = ClientMocks.mockCyclonNode();
        asyncExecService = ClientMocks.mockAsyncExecService();
        loggingService = ClientMocks.mockLoggingService();
        channel = ClientMocks.mockChannel();

        //
        // Mock behaviour
        //
        localCyclonNode.handleShuffleRequest.andReturn(RESPONSE_PAYLOAD);

        incomingShuffleState = new IncomingShuffleState(localCyclonNode, SOURCE_POINTER, asyncExecService, loggingService);
    });

    describe("when processing a shuffle request", function () {

        describe("and everything succeeds", function() {
            beforeEach(function () {
                channel.receive.andReturn(Promise.resolve(REQUEST_PAYLOAD));
                asyncExecService.setTimeout.andCallFake(function (callback) {
                    callback();
                });
            });

            it("delegates to the node to handle the request, then sends the response via the data channel", function () {
                runs(function () {
                    incomingShuffleState.processShuffleRequest(channel)
                        .then(successCallback).catch(failureCallback);
                });

                waits(5);

                runs(function () {
                    expect(localCyclonNode.handleShuffleRequest).toHaveBeenCalledWith(SOURCE_POINTER, REQUEST_PAYLOAD);
                    expect(channel.send).toHaveBeenCalledWith("shuffleResponse", RESPONSE_PAYLOAD);
                    expect(successCallback).toHaveBeenCalledWith(channel);
                    expect(failureCallback).not.toHaveBeenCalled();
                });
            });
        });

        describe("and a timeout occurs waiting for the request", function(){
            var timeoutError;

            beforeEach(function() {
                runs(function() {
                    timeoutError = new Promise.TimeoutError();
                    channel.receive.andReturn(Promise.reject(timeoutError));
                    incomingShuffleState.processShuffleRequest(channel)
                        .then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("does not attempt to handle the request", function() {
                expect(localCyclonNode.handleShuffleRequest).not.toHaveBeenCalled();
            });

            it("rejects with a timeout error", function() {
                expect(failureCallback).toHaveBeenCalledWith(timeoutError);
                expect(successCallback).not.toHaveBeenCalled();
            });
        });

        describe("and cancel is called before the response is sent", function() {

            beforeEach(function() {
                runs(function() {
                    asyncExecService.setTimeout.andReturn(TIMEOUT_ID);
                    channel.receive.andReturn(Promise.resolve({payload: REQUEST_PAYLOAD}));
                    incomingShuffleState.processShuffleRequest(channel)
                        .then(successCallback).catch(failureCallback).cancel();
                });

                waits(100);
            });

            it("cancels the response sending", function() {
                expect(asyncExecService.clearTimeout).toHaveBeenCalledWith(TIMEOUT_ID);
            });

            it("rejects with a cancellation error", function() {
                expect(failureCallback).toHaveBeenCalledWith(jasmine.any(Promise.CancellationError));
                expect(successCallback).not.toHaveBeenCalled();
            })
        });

        describe("and cancel is called before the request arrives", function() {

            var cancellationError;

            beforeEach(function() {
                runs(function() {
                    cancellationError = new Promise.CancellationError();
                    channel.receive.andReturn(Promise.reject(cancellationError));
                    incomingShuffleState.processShuffleRequest(channel)
                        .then(successCallback).catch(failureCallback).cancel();
                });

                waits(100);
            });

            it("doesn't call handleShuffleRequest", function() {
                expect(localCyclonNode.handleShuffleRequest).not.toHaveBeenCalled();
            });

            it("rejects with a cancellation error", function() {
                expect(failureCallback).toHaveBeenCalledWith(cancellationError);
                expect(successCallback).not.toHaveBeenCalled();
            });
        });
    });

    describe("when waiting for the response acknowledgement", function() {

        describe("and everything succeeds", function() {
            beforeEach(function() {
                runs(function() {
                    channel.receive.andReturn(Promise.resolve(null));
                    incomingShuffleState.waitForResponseAcknowledgement(channel)
                        .then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("delegates to the messaging utilities to receive the acknowledgement", function() {
                expect(channel.receive).toHaveBeenCalledWith("shuffleResponseAcknowledgement", jasmine.any(Number));
            });

            it("resolves", function() {
                expect(successCallback).toHaveBeenCalled();
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        describe("and a timeout occurs", function() {

            var timeoutError;

            beforeEach(function() {
                runs(function() {
                    timeoutError = new Promise.TimeoutError();
                    channel.receive.andReturn(Promise.reject(timeoutError));
                    incomingShuffleState.waitForResponseAcknowledgement(channel)
                        .then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("logs a warning and resolves", function() {
                expect(loggingService.warn).toHaveBeenCalled();
                expect(successCallback).toHaveBeenCalled();
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        describe("and cancel is called before the acknowledgement arrives", function() {
            var cancellationError;

            beforeEach(function() {
                runs(function() {
                    cancellationError = new Promise.CancellationError();
                    channel.receive.andReturn(Promise.reject(cancellationError));
                    incomingShuffleState.waitForResponseAcknowledgement(channel)
                        .then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("rejects with the cancellation error", function() {
                expect(failureCallback).toHaveBeenCalledWith(cancellationError);
                expect(successCallback).not.toHaveBeenCalled();
            });
        });
    });

    describe("when closing", function() {

        beforeEach(function() {
            runs(function() {
                asyncExecService.setTimeout.andReturn(TIMEOUT_ID);
                channel.receive.andReturn(Promise.resolve({payload: REQUEST_PAYLOAD}));
                incomingShuffleState.processShuffleRequest(channel)
                    .then(successCallback).catch(failureCallback);
            });

            waits(10);

            runs(function() {
                incomingShuffleState.close();
            });
        });

        it("clears the response sending timeout", function() {
            expect(asyncExecService.clearTimeout).toHaveBeenCalledWith(TIMEOUT_ID);
        });
    });

    describe("when cancelling", function() {

        var lastOutstandingPromise;

        beforeEach(function() {
            lastOutstandingPromise = ClientMocks.mockPromise();
            channel.receive.andReturn(lastOutstandingPromise);
            incomingShuffleState.processShuffleRequest(channel)
                .then(successCallback).catch(failureCallback);
        });

        describe("and the last outstanding promise is pending", function() {
            beforeEach(function() {
                lastOutstandingPromise.isPending.andReturn(true);
                incomingShuffleState.cancel();
            });

            it("cancels the latest outstanding promise", function() {
                expect(lastOutstandingPromise.cancel).toHaveBeenCalled();
            });
        });

        describe("and the last outstanding promise is not pending", function() {
            beforeEach(function() {
                lastOutstandingPromise.isPending.andReturn(false);
                incomingShuffleState.cancel();
            });

            it("doesn't cancel the latest outstanding promise", function() {
                expect(lastOutstandingPromise.cancel).not.toHaveBeenCalled();
            });
        });
    });
});
