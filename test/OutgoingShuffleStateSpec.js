'use strict';

const {TimeoutError} = require("cyclon.p2p-common");
const {OutgoingShuffleState} = require("../lib/OutgoingShuffleState");
const ClientMocks = require("./ClientMocks");

describe("The Outgoing ShuffleState", function () {

    const TIMEOUT_ID = 12345;
    const SHUFFLE_SET = ["a", "b", "c"];
    const DESTINATION_NODE_POINTER = {
        id: "OTHER_NODE_ID"
    };
    const RESPONSE_PAYLOAD = "RESPONSE_PAYLOAD";

    let localCyclonNode,
        asyncExecService,
        loggingService,
        channel;

    let successCallback, failureCallback;

    let outgoingShuffleState;

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
        asyncExecService.setTimeout.and.returnValue(TIMEOUT_ID);

        outgoingShuffleState = new OutgoingShuffleState(localCyclonNode, DESTINATION_NODE_POINTER, SHUFFLE_SET, asyncExecService, loggingService);
    });

    describe("after channel establishment", function() {

        beforeEach(function() {
            outgoingShuffleState.storeChannel(channel);
        });

        describe("when sending a shuffle request", function () {

            beforeEach(function () {
                outgoingShuffleState.sendShuffleRequest();
            });

            it("should send the message over the data channel", function () {
                expect(channel.send).toHaveBeenCalledWith("shuffleRequest", SHUFFLE_SET);
            });
        });

        describe("when processing a shuffle response", function () {

            describe("and a response is not received before the timeout", function () {

                beforeEach(async () => {
                    let timeoutError = new TimeoutError('timeout');
                    channel.receive.and.returnValue(Promise.reject(timeoutError));
                    try {
                        await outgoingShuffleState.processShuffleResponse();
                        fail();
                    } catch (e) {
                        expect(e).toBe(timeoutError);
                    }
                });

                it("should not attempt to handle a response", function () {
                    expect(localCyclonNode.handleShuffleResponse).not.toHaveBeenCalled();
                });
            });

            describe("and a response is received before timeout", function () {

                beforeEach(async () => {
                    channel.receive.and.returnValue(Promise.resolve(RESPONSE_PAYLOAD));
                    await outgoingShuffleState.processShuffleResponse();
                });

                it("should delegate to the local node to handle the response", function () {
                    expect(localCyclonNode.handleShuffleResponse).toHaveBeenCalledWith(DESTINATION_NODE_POINTER, RESPONSE_PAYLOAD);
                });
            });
        });

        describe("when sending a response acknowledgement", function () {

            describe("and everything succeeds", function () {
                beforeEach(async () => {
                    asyncExecService.setTimeout.and.callFake(function(callback) {
                        callback();
                    });
                    await outgoingShuffleState.sendResponseAcknowledgement();
                });

                it("sends the acknowledgement over the channel", function () {
                    expect(channel.send).toHaveBeenCalledWith("shuffleResponseAcknowledgement");
                });
            });
        });

        describe("when closing", function() {

            let channelClosingTimeoutId = "channelClosingTimeoutId";

            beforeEach(function() {
                asyncExecService.setTimeout.and.returnValue(channelClosingTimeoutId);
                outgoingShuffleState.sendResponseAcknowledgement();

                outgoingShuffleState.close();
            });

            it("clears the channel closing timeout", function() {
                expect(asyncExecService.clearTimeout).toHaveBeenCalledWith(channelClosingTimeoutId);
            });
        });
    });
});
