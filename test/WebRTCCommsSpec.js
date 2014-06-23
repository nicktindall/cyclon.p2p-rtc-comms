'use strict';

var Promise = require("bluebird");
var WebRTCComms = require("../lib/WebRTCComms");
var ClientMocks = require("./ClientMocks");

describe("The WebRTC Comms layer", function () {

    var WAIT_FOR_CHANNEL_TO_OPEN_RESULT = "WAIT_FOR_CHANNEL_TO_OPEN_RESULT",
        SEND_SHUFFLE_REQUEST_RESULT = "SEND_SHUFFLE_REQUEST_RESULT",
        WAIT_FOR_ANSWER_RESULT = "WAIT_FOR_ANSWER_RESULT",
        PROCESS_SHUFFLE_RESPONSE_RESULT = "PROCESS_SHUFFLE_RESULT_RESULT",
        CREATE_OFFER_RESULT = "CREATE_OFFER_RESULT",
        WAIT_FOR_ICE_CANDIDATES_RESULT = "WAIT_FOR_ICE_CANDIDATES_RESULT",
        SEND_OFFER_RESULT = "SEND_OFFER_RESULT",
        HANDLE_ANSWER_RESULT = "HANDLE_ANSWER_RESULT",
        CREATE_ANSWER_RESULT = "CREATE_ANSWER_RESULT",
        SEND_ANSWER_RESULT = "SEND_ANSWER_RESULT",
        WAIT_FOR_CHANNEL_ESTABLISHMENT_RESULT = "WAIT_FOR_CHANNEL_ESTABLISHMENT_RESULT",
        SEND_RESPONSE_ACKNOWLEDGEMENT_RESULT = "SEND_RESPONSE_ACKNOWLEDGEMENT_RESULT",
        PROCESS_SHUFFLE_REQUEST_RESULT = "PROCESS_SHUFFLE_REQUEST_RESULT",
        WAIT_FOR_RESPONSE_ACKNOWLEDGEMENT_RESULT = "WAIT_FOR_RESPONSE_ACKNOWLEDGEMENT_RESULT";

    var comms,
        signallingService,
        peerConnectionFactory,
        shuffleStateFactory,
        outgoingShuffleState,
        localCyclonNode,
        peerConnection,
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
        signallingService = ClientMocks.mockSignallingService();
        peerConnectionFactory = ClientMocks.mockPeerConnectionFactory();
        shuffleStateFactory = ClientMocks.mockShuffleStateFactory();
        localCyclonNode = ClientMocks.mockCyclonNode();
        outgoingShuffleState = createSucceedingOutgoingShuffleState();
        incomingShuffleState = createSucceedingIncomingShuffleState();
        loggingService = ClientMocks.mockLoggingService();

        destinationNodePointer = createCacheEntry("destinationNodePointer", 12);
        shuffleSet = [createCacheEntry("a", 456), createCacheEntry("b", 123), createCacheEntry("c", 222)];
        peerConnection = createSucceedingPeerConnection();

        //
        // Mock behaviour
        //
        shuffleStateFactory.createOutgoingShuffleState.andReturn(outgoingShuffleState);
        shuffleStateFactory.createIncomingShuffleState.andReturn(incomingShuffleState);
        peerConnectionFactory.createPeerConnection.andReturn(peerConnection);

        comms = new WebRTCComms(peerConnectionFactory, shuffleStateFactory, signallingService, loggingService);
    });

    describe("when initializing", function () {

        beforeEach(function() {
            comms.initialize(localCyclonNode);
        });

        it("should initialize its signalling service", function () {
            expect(signallingService.initialize).toHaveBeenCalledWith(localCyclonNode);
        });

        it("should add a listener for offers", function() {
            expect(signallingService.on).toHaveBeenCalledWith("offer", comms.handleOffer);
        });
    });

    describe("before sending a shuffle request", function () {

        beforeEach(function () {
            comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet);
        });

        it("should create a new peer connection", function () {
            expect(peerConnectionFactory.createPeerConnection).toHaveBeenCalledWith();
        });

        it("should create a new outgoing shuffle state", function () {
            expect(shuffleStateFactory.createOutgoingShuffleState).toHaveBeenCalledWith(localCyclonNode, destinationNodePointer, shuffleSet, signallingService);
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
                expect(peerConnection.createOffer).toHaveBeenCalledWith();
                expect(peerConnection.waitForIceCandidates).toHaveBeenCalledWith(CREATE_OFFER_RESULT);
                expect(outgoingShuffleState.sendOffer).toHaveBeenCalledWith(WAIT_FOR_ICE_CANDIDATES_RESULT);
                expect(outgoingShuffleState.waitForAnswer).toHaveBeenCalledWith(SEND_OFFER_RESULT);
                expect(peerConnection.handleAnswer).toHaveBeenCalledWith(WAIT_FOR_ANSWER_RESULT);
                expect(peerConnection.waitForChannelToOpen).toHaveBeenCalledWith(HANDLE_ANSWER_RESULT);
                expect(outgoingShuffleState.sendShuffleRequest).toHaveBeenCalledWith(WAIT_FOR_CHANNEL_TO_OPEN_RESULT);
                expect(outgoingShuffleState.processShuffleResponse).toHaveBeenCalledWith(SEND_SHUFFLE_REQUEST_RESULT);
                expect(outgoingShuffleState.sendResponseAcknowledgement).toHaveBeenCalledWith(PROCESS_SHUFFLE_RESPONSE_RESULT);
                expect(successCallback).toHaveBeenCalledWith(SEND_RESPONSE_ACKNOWLEDGEMENT_RESULT);

                // Clean up occurred
                expect(peerConnection.close).toHaveBeenCalled();
                expect(outgoingShuffleState.close).toHaveBeenCalled();

                // Failure didn't occur
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        it("should not send the offer when it is not created successfully", function () {

            runs(function () {
                peerConnection.createOffer.andReturn(Promise.reject(new Error("bad")));
                comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet)
                    .then(successCallback).catch(failureCallback);
            });

            waits(10);

            runs(function () {
                expect(outgoingShuffleState.sendOffer).not.toHaveBeenCalled();

                // Clean up occurred
                expect(peerConnection.close).toHaveBeenCalled();
                expect(outgoingShuffleState.close).toHaveBeenCalled();

                // Failure occurred
                expect(failureCallback).toHaveBeenCalled();
            });
        });

        it("should cause the resources from the previous shuffle to be cleaned up when the next one starts if it has not completed successfully", function () {

            var firstPeerConnection = createSucceedingPeerConnection("firstPeerConnection");
            var firstOutgoingState = createSucceedingOutgoingShuffleState("firstOutgoingState");
            var secondPeerConnection = createSucceedingPeerConnection("secondPeerConnection");
            var secondOutgoingState = createSucceedingOutgoingShuffleState("secondOutgoingState");

            runs(function () {
                var waitForChannelToOpenPromise = new Promise(function () {
                }).cancellable();
                firstPeerConnection.waitForChannelToOpen.andReturn(waitForChannelToOpenPromise);   // it gets held up at waiting for the channel to open
                firstPeerConnection.cancel.andCallFake(function () {
                    waitForChannelToOpenPromise.cancel();
                });

                peerConnectionFactory.createPeerConnection.andReturn(firstPeerConnection);
                shuffleStateFactory.createOutgoingShuffleState.andReturn(firstOutgoingState);
                comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet)
                    .then(successCallback).catch(failureCallback);
            });

            waits(100);

            runs(function () {
                peerConnectionFactory.createPeerConnection.andReturn(secondPeerConnection);
                shuffleStateFactory.createOutgoingShuffleState.andReturn(secondOutgoingState);
                comms.sendShuffleRequest(localCyclonNode, destinationNodePointer, shuffleSet);
            });

            waits(100);

            runs(function () {
                expect(firstPeerConnection.waitForChannelToOpen).toHaveBeenCalled();
                expect(firstOutgoingState.sendShuffleRequest).not.toHaveBeenCalled();

                expect(firstPeerConnection.cancel).toHaveBeenCalled();
                expect(firstOutgoingState.cancel).toHaveBeenCalled();

                expect(firstPeerConnection.close).toHaveBeenCalled();
                expect(firstOutgoingState.close).toHaveBeenCalled();

                expect(failureCallback).toHaveBeenCalledWith(jasmine.any(Promise.CancellationError));
            });
        });
    });


    describe("when handling an offer", function () {

        var offerMessage = {
            sourceId: "SOURCE_ID",
            sourcePointer: "SOURCE_POINTER",
            sessionDescription: "SESSION_DESCRIPTION",
            iceCandidates: "ICE_CANDIDATES"
        };

        beforeEach(function() {
            comms.initialize(localCyclonNode);
        });

        describe("before sending an answer", function () {
            beforeEach(function () {
                comms.handleOffer(offerMessage).then(successCallback).catch(failureCallback);
            });

            it("should create a new incoming connection", function () {
                expect(peerConnectionFactory.createPeerConnection).toHaveBeenCalledWith();
            });

            it("should create a new incoming shuffle state", function () {
                expect(shuffleStateFactory.createIncomingShuffleState).toHaveBeenCalledWith(localCyclonNode, peerConnection, offerMessage.sourcePointer, signallingService);
            });
        });

        describe("and everything succeeds", function () {

            beforeEach(function () {
                runs(function () {
                    comms.handleOffer(offerMessage).then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("should perform the exchange with the source peer then clean up when an answer is created successfully", function () {

                runs(function () {
                    expect(peerConnection.createAnswer).toHaveBeenCalledWith(offerMessage.sessionDescription, offerMessage.iceCandidates);
                    expect(peerConnection.waitForIceCandidates).toHaveBeenCalledWith(CREATE_ANSWER_RESULT);
                    expect(incomingShuffleState.sendAnswer).toHaveBeenCalledWith(WAIT_FOR_ICE_CANDIDATES_RESULT);
                    expect(peerConnection.waitForChannelEstablishment).toHaveBeenCalledWith(SEND_ANSWER_RESULT);
                    expect(peerConnection.waitForChannelToOpen).toHaveBeenCalledWith(WAIT_FOR_CHANNEL_ESTABLISHMENT_RESULT);
                    expect(incomingShuffleState.processShuffleRequest).toHaveBeenCalledWith(WAIT_FOR_CHANNEL_TO_OPEN_RESULT);

                    // and cleanup
                    expect(peerConnection.close).toHaveBeenCalled();
                    expect(incomingShuffleState.close).toHaveBeenCalled();

                    // Success!
                    expect(successCallback).toHaveBeenCalled();
                    expect(failureCallback).not.toHaveBeenCalled();
                });
            });
        });

        describe("and creating the answer fails", function () {

            beforeEach(function () {
                runs(function () {
                    peerConnection.createAnswer.andReturn(Promise.reject(new Error("create answer failed")));
                    comms.handleOffer(offerMessage).then(successCallback).catch(failureCallback);
                });

                waits(10);
            });

            it("should clean up it state and not send the answer", function () {

                runs(function () {
                    expect(incomingShuffleState.sendAnswer).not.toHaveBeenCalled();

                    // Close should still be called
                    expect(peerConnection.close).toHaveBeenCalled();
                    expect(incomingShuffleState.close).toHaveBeenCalled();

                    // The error should be handled
                    expect(failureCallback).not.toHaveBeenCalled();
                    expect(successCallback).toHaveBeenCalled();
                });
            });
        });
    });

    function createSucceedingPeerConnection(name) {
        var peerConnection = ClientMocks.mockPeerConnection(name);
        peerConnection.waitForChannelEstablishment.andReturn(Promise.resolve(WAIT_FOR_CHANNEL_ESTABLISHMENT_RESULT));
        peerConnection.waitForChannelToOpen.andReturn(Promise.resolve(WAIT_FOR_CHANNEL_TO_OPEN_RESULT));
        peerConnection.handleAnswer.andReturn(Promise.resolve(HANDLE_ANSWER_RESULT));
        peerConnection.createOffer.andReturn(Promise.resolve(CREATE_OFFER_RESULT));
        peerConnection.waitForIceCandidates.andReturn(Promise.resolve(WAIT_FOR_ICE_CANDIDATES_RESULT));
        peerConnection.createAnswer.andReturn(Promise.resolve(CREATE_ANSWER_RESULT));
        return peerConnection;
    }

    function createSucceedingOutgoingShuffleState(name) {
        var outgoingShuffleState = ClientMocks.mockOutgoingShuffleState(name);
        outgoingShuffleState.sendShuffleRequest.andReturn(Promise.resolve(SEND_SHUFFLE_REQUEST_RESULT));
        outgoingShuffleState.waitForAnswer.andReturn(Promise.resolve(WAIT_FOR_ANSWER_RESULT));
        outgoingShuffleState.processShuffleResponse.andReturn(Promise.resolve(PROCESS_SHUFFLE_RESPONSE_RESULT));
        outgoingShuffleState.sendOffer.andReturn(Promise.resolve(SEND_OFFER_RESULT));
        outgoingShuffleState.sendResponseAcknowledgement.andReturn(Promise.resolve(SEND_RESPONSE_ACKNOWLEDGEMENT_RESULT));
        return outgoingShuffleState;
    }

    function createSucceedingIncomingShuffleState() {
        var incomingShuffleState = ClientMocks.mockIncomingShuffleState();
        incomingShuffleState.sendAnswer.andReturn(SEND_ANSWER_RESULT);
        incomingShuffleState.processShuffleRequest.andReturn(PROCESS_SHUFFLE_REQUEST_RESULT);
        incomingShuffleState.waitForResponseAcknowledgement.andReturn(WAIT_FOR_RESPONSE_ACKNOWLEDGEMENT_RESULT);
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