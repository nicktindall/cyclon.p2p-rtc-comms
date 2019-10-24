'use strict';

const {TimeoutError} = require("cyclon.p2p-common");

const {IncomingShuffleState} = require("../lib/IncomingShuffleState.js");
const ClientMocks = require("./ClientMocks");

describe("The Incoming ShuffleState", function () {

    const SOURCE_POINTER = {id: "SOURCE_ID", age: 10};

    const REQUEST_PAYLOAD = "REQUEST_PAYLOAD";
    const RESPONSE_PAYLOAD = "RESPONSE_PAYLOAD";

    let localCyclonNode,
        asyncExecService,
        loggingService,
        successCallback,
        failureCallback,
        channel;

    let incomingShuffleState;

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
        localCyclonNode.handleShuffleRequest.and.returnValue(RESPONSE_PAYLOAD);

        incomingShuffleState = new IncomingShuffleState(localCyclonNode, SOURCE_POINTER, asyncExecService, loggingService);
    });

    describe("when processing a shuffle request", function () {

        describe("and everything succeeds", function() {
            beforeEach(function () {
                channel.receive.and.returnValue(Promise.resolve(REQUEST_PAYLOAD));
                asyncExecService.setTimeout.and.callFake(function (callback) {
                    callback();
                });
            });

            it("delegates to the node to handle the request, then sends the response via the data channel", async () => {
                await incomingShuffleState.processShuffleRequest(channel);
                expect(localCyclonNode.handleShuffleRequest).toHaveBeenCalledWith(SOURCE_POINTER, REQUEST_PAYLOAD);
                expect(channel.send).toHaveBeenCalledWith("shuffleResponse", RESPONSE_PAYLOAD);
            });
        });

        describe("and a timeout occurs waiting for the request", function(){
            let timeoutError;

            beforeEach(async () => {
                timeoutError = new TimeoutError('timeout');
                channel.receive.and.returnValue(Promise.reject(timeoutError));
                try {
                    await incomingShuffleState.processShuffleRequest(channel);
                    fail();
                } catch (e) {
                    expect(e).toBe(timeoutError);
                }
            });

            it("does not attempt to handle the request", function() {
                expect(localCyclonNode.handleShuffleRequest).not.toHaveBeenCalled();
            });
        });
    });

    describe("when waiting for the response acknowledgement", function() {

        describe("and everything succeeds", function() {
            beforeEach(async () => {
                channel.receive.and.returnValue(Promise.resolve(null));
                await incomingShuffleState.waitForResponseAcknowledgement(channel);
            });

            it("delegates to the messaging utilities to receive the acknowledgement", function() {
                expect(channel.receive).toHaveBeenCalledWith("shuffleResponseAcknowledgement", jasmine.any(Number));
            });
        });

        describe("and a timeout occurs", function() {

            it("logs a warning and resolves", async () => {
                channel.receive.and.returnValue(Promise.reject(new TimeoutError('timeout')));
                await incomingShuffleState.waitForResponseAcknowledgement(channel);
                expect(loggingService.warn).toHaveBeenCalled();
            });
        });
    });
});
