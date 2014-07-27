'use strict';

var Promise = require("bluebird");
var WebRTCComms = require("../lib/WebRTCComms");
var ClientMocks = require("./ClientMocks");

describe("The WebRTC Comms layer", function () {

    var WAIT_FOR_CHANNEL_TO_OPEN_RESULT = "WAIT_FOR_CHANNEL_TO_OPEN_RESULT",
        SEND_SHUFFLE_REQUEST_RESULT = "SEND_SHUFFLE_REQUEST_RESULT",
        PROCESS_SHUFFLE_RESPONSE_RESULT = "PROCESS_SHUFFLE_RESULT_RESULT",
        SEND_RESPONSE_ACKNOWLEDGEMENT_RESULT = "SEND_RESPONSE_ACKNOWLEDGEMENT_RESULT",
        PROCESS_SHUFFLE_REQUEST_RESULT = "PROCESS_SHUFFLE_REQUEST_RESULT",
        WAIT_FOR_RESPONSE_ACKNOWLEDGEMENT_RESULT = "WAIT_FOR_RESPONSE_ACKNOWLEDGEMENT_RESULT";

    var comms,
        channel,
        rtc,
        shuffleStateFactory,
        outgoingShuffleState,
        localCyclonNode,
        destinationNodePointer,
        shuffleSet,
        incomingShuffleState,
        loggingService,
        successCallback,
        failureCallback;

    beforeEach(function () {
        successCallback = ClientMocks.createSuccessCallback();
        failureCallback = ClientMocks.createFailureCallback();

        // Create mocks
        rtc = ClientMocks.mockRtc();
        channel = ClientMocks.mockChannel();
        shuffleStateFactory = ClientMocks.mockShuffleStateFactory();
        localCyclonNode = ClientMocks.mockCyclonNode();
        outgoingShuffleState = createSucceedingOutgoingShuffleState();
        incomingShuffleState = createSucceedingIncomingShuffleState();
        loggingService = ClientMocks.mockLoggingService();

        destinationNodePointer = createCacheEntry("destinationNodePointer", 12);
        shuffleSet = [createCacheEntry("a", 456), createCacheEntry("b", 123), createCacheEntry("c", 222)];

        //
        // Mock behaviour
        //
        rtc.openChannel.andReturn(Promise.resolve(WAIT_FOR_CHANNEL_TO_OPEN_RESULT));
        channel.getRemotePeer.andReturn(destinationNodePointer);
        shuffleStateFactory.createOutgoingShuffleState.andReturn(outgoingShuffleState);
        shuffleStateFactory.createIncomingShuffleState.andReturn(incomingShuffleState);

        comms = new WebRTCComms(rtc, shuffleStateFactory, loggingService);
    });

    describe("when initializing", function () {

        beforeEach(function() {
            comms.initialize(localCyclonNode);
        });

        it("should initialize the RTC layer", function () {
            expect(rtc.connect).toHaveBeenCalledWith(localCyclonNode);
        });

        it("should add a listener for incoming shuffle channels", function() {
            expect(rtc.onChannel).toHaveBeenCalledWith("cyclonShuffle", comms.handleIncomingShuffle);
        });
    });

    describe("before sending a shuffle request", function () {

        beforeEach(function () {
            comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet);
        });

        it("should create a new outgoing shuffle state", function () {
            expect(shuffleStateFactory.createOutgoingShuffleState).toHaveBeenCalledWith(localCyclonNode, destinationNodePointer, shuffleSet);
        });
    });

    describe("when sending a shuffle request", function () {

        describe("and everything succeeds", function () {
            beforeEach(function () {
                runs(function () {
                    comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet)
                        .then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("should perform the peer exchange then cleanup resources when the offer is created successfully", function () {

                // The exchange occurred
                expect(rtc.openChannel).toHaveBeenCalledWith("cyclonShuffle", destinationNodePointer);
                expect(outgoingShuffleState.sendShuffleRequest).toHaveBeenCalledWith(WAIT_FOR_CHANNEL_TO_OPEN_RESULT);
                expect(outgoingShuffleState.processShuffleResponse).toHaveBeenCalledWith(SEND_SHUFFLE_REQUEST_RESULT);
                expect(outgoingShuffleState.sendResponseAcknowledgement).toHaveBeenCalledWith(PROCESS_SHUFFLE_RESPONSE_RESULT);
                expect(successCallback).toHaveBeenCalledWith(SEND_RESPONSE_ACKNOWLEDGEMENT_RESULT);

                // Clean up occurred
                expect(outgoingShuffleState.close).toHaveBeenCalled();

                // Failure didn't occur
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        it("should not send the request when the channel does not open successfully", function () {

            runs(function () {
                rtc.openChannel.andReturn(Promise.reject(new Error("bad")));
                comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet)
                    .then(successCallback).catch(failureCallback);
            });

            waits(10);

            runs(function () {
                expect(outgoingShuffleState.sendShuffleRequest).not.toHaveBeenCalled();

                // Clean up occurred
                expect(outgoingShuffleState.close).toHaveBeenCalled();

                // Failure occurred
                expect(failureCallback).toHaveBeenCalled();
            });
        });

        it("should cause the resources from the previous shuffle to be cleaned up when the next one starts and it has not completed successfully", function () {

            var firstOutgoingState = createSucceedingOutgoingShuffleState("firstOutgoingState");
            var secondOutgoingState = createSucceedingOutgoingShuffleState("secondOutgoingState");
            var secondFailureCallback = jasmine.createSpy('secondFailureCallback');

            runs(function () {
                var waitForChannelToOpenPromise = new Promise(function () {
                }).cancellable();
                rtc.openChannel.andReturn(waitForChannelToOpenPromise);   // it gets held up at waiting for the channel to open
                firstOutgoingState.cancel.andCallFake(function () {
                    waitForChannelToOpenPromise.cancel();
                });

                shuffleStateFactory.createOutgoingShuffleState.andReturn(firstOutgoingState);
                comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet)
                    .then(successCallback).catch(failureCallback);
            });

            waits(100);

            runs(function () {
                var waitForChannelToOpenPromise = new Promise(function () {
                }).cancellable();
                rtc.openChannel.andReturn(waitForChannelToOpenPromise);   // it gets held up at waiting for the channel to open
                secondOutgoingState.cancel.andCallFake(function () {
                    waitForChannelToOpenPromise.cancel();
                });
                shuffleStateFactory.createOutgoingShuffleState.andReturn(secondOutgoingState);
                comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet)
                    .catch(secondFailureCallback);
            });

            waits(100);

            runs(function () {
                expect(firstOutgoingState.sendShuffleRequest).not.toHaveBeenCalled();
                expect(firstOutgoingState.cancel).toHaveBeenCalled();
                expect(firstOutgoingState.close).toHaveBeenCalled();

                expect(failureCallback).toHaveBeenCalledWith(jasmine.any(Promise.CancellationError));
                expect(secondFailureCallback).not.toHaveBeenCalled();
            });
        });
    });

    describe("when handling an incoming shuffle", function () {

        beforeEach(function() {
            comms.initialize(localCyclonNode);
        });

        describe("before processing the shuffle request", function () {
            beforeEach(function () {
                comms.handleIncomingShuffle(channel).then(successCallback).catch(failureCallback);
            });

            it("should create a new incoming shuffle state", function () {
                expect(shuffleStateFactory.createIncomingShuffleState).toHaveBeenCalledWith(localCyclonNode, destinationNodePointer);
            });
        });

        describe("and everything succeeds", function () {

            beforeEach(function () {
                runs(function () {
                    comms.handleIncomingShuffle(channel).then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("should perform the exchange with the source peer then clean up when an answer is created successfully", function () {

                runs(function () {
                    expect(incomingShuffleState.processShuffleRequest).toHaveBeenCalledWith(channel);
                    expect(incomingShuffleState.waitForResponseAcknowledgement).toHaveBeenCalledWith(PROCESS_SHUFFLE_REQUEST_RESULT);

                    // and cleanup
                    expect(incomingShuffleState.close).toHaveBeenCalled();

                    // Success!
                    expect(successCallback).toHaveBeenCalled();
                    expect(failureCallback).not.toHaveBeenCalled();
                });
            });
        });

        describe("and a timeout occurs waiting for the shuffle request", function () {

            beforeEach(function () {
                runs(function () {
                    incomingShuffleState.processShuffleRequest.andReturn(Promise.reject(new Promise.TimeoutError()));
                    comms.handleIncomingShuffle(channel).then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("should clean up it state and not wait for the acknowledgement", function () {

                runs(function () {
                    expect(incomingShuffleState.waitForResponseAcknowledgement).not.toHaveBeenCalled();

                    // Close should still be called
                    expect(incomingShuffleState.close).toHaveBeenCalled();

                    // The error should be handled
                    expect(failureCallback).not.toHaveBeenCalled();
                    expect(successCallback).toHaveBeenCalled();
                });
            });
        });
    });

    function createSucceedingOutgoingShuffleState(name) {
        var outgoingShuffleState = ClientMocks.mockOutgoingShuffleState(name);
        outgoingShuffleState.sendShuffleRequest.andReturn(Promise.resolve(SEND_SHUFFLE_REQUEST_RESULT));
        outgoingShuffleState.processShuffleResponse.andReturn(Promise.resolve(PROCESS_SHUFFLE_RESPONSE_RESULT));
        outgoingShuffleState.sendResponseAcknowledgement.andReturn(Promise.resolve(SEND_RESPONSE_ACKNOWLEDGEMENT_RESULT));
        return outgoingShuffleState;
    }

    function createSucceedingIncomingShuffleState() {
        var incomingShuffleState = ClientMocks.mockIncomingShuffleState();
        incomingShuffleState.processShuffleRequest.andReturn(Promise.resolve(PROCESS_SHUFFLE_REQUEST_RESULT));
        incomingShuffleState.waitForResponseAcknowledgement.andReturn(Promise.resolve(WAIT_FOR_RESPONSE_ACKNOWLEDGEMENT_RESULT));
        return incomingShuffleState;
    }

    /**
     * Create a cache entry
     *
     * @param id
     * @param age
     * @returns {{id: *, age: *}}
     */
    function createCacheEntry(id, age) {
        return {
            id: id,
            age: age
        };
    }
});
