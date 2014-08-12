'use strict';

var Promise = require("bluebird");
var SignallingServerBootstrap = require("../lib/SignallingServerBootstrap");
var ClientMocks = require("./ClientMocks");

describe("The signalling server bootstrap", function () {

    var SIGNALLING_SERVERS = [
        {
            signallingApiBase: "http://one"
        },
        {
            signallingApiBase: "http://two"
        }
    ];

    var NODE_ID = "NODE_ID",
        LIMIT = 50;

    var bootstrap,
        signallingSocket,
        httpRequestService,
        cyclonNode,
        serverOneResponse,
        serverTwoResponse;

    var successCallback,
        failureCallback;

    beforeEach(function () {
        successCallback = ClientMocks.createSuccessCallback();
        failureCallback = ClientMocks.createFailureCallback();

        cyclonNode = ClientMocks.mockCyclonNode();
        signallingSocket = ClientMocks.mockSignallingSocket();
        httpRequestService = ClientMocks.mockHttpRequestService();

        //
        // Mock behaviour
        //
        signallingSocket.getCurrentServerSpecs.andReturn(SIGNALLING_SERVERS);
        cyclonNode.getId.andReturn(NODE_ID);
        httpRequestService.get.andCallFake(function (url) {
            if (url.indexOf("http://one/api/peers") === 0) {
                return serverOneResponse;
            }
            else if (url.indexOf("http://two/api/peers") === 0) {
                return serverTwoResponse;
            }
            throw new Error("Something weird happened");
        });

        bootstrap = new SignallingServerBootstrap(signallingSocket, httpRequestService);
    });

    describe("when fetching initial peer sets", function () {

        it("returns combined results from all servers that respond", function () {

            serverOneResponse = Promise.resolve({
                NODE_ID: {id: NODE_ID},
                NODE_ID_ONE: {id: "NODE_ID_ONE"}
            });
            serverTwoResponse = Promise.resolve({
                NODE_ID: {id: NODE_ID},
                NODE_ID_TWO: {id: "NODE_ID_TWO"}
            });

            runs(function () {
                bootstrap.getInitialPeerSet(cyclonNode, LIMIT).then(successCallback).catch(failureCallback);
            });

            waits(10);

            runs(function () {
                expect(successCallback).toHaveBeenCalledWith([
                    {id: "NODE_ID_ONE"},
                    {id: "NODE_ID_TWO"}
                ]);
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        it("restricts the number of peers returned to that requested", function () {

            serverOneResponse = Promise.resolve({
                NODE_ID: {id: NODE_ID},
                NODE_ID_ONE: {id: "NODE_ID_ONE"}
            });
            serverTwoResponse = Promise.resolve({
                NODE_ID: {id: NODE_ID},
                NODE_ID_TWO: {id: "NODE_ID_TWO"}
            });

            runs(function () {
                bootstrap.getInitialPeerSet(cyclonNode, 1).then(successCallback).catch(failureCallback);
            });

            waits(10);

            runs(function () {
                expect(successCallback).toHaveBeenCalled();
                expect(successCallback.mostRecentCall.args[0].length).toBe(1);
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });

        it("returns an empty array when no results are returned", function () {

            serverOneResponse = Promise.reject(new Error("dumb"));
            serverTwoResponse = Promise.reject(new Error("dumber"));

            runs(function () {
                bootstrap.getInitialPeerSet(cyclonNode, LIMIT).then(successCallback).catch(failureCallback);
            });

            waits(10);

            runs(function () {
                expect(successCallback).toHaveBeenCalledWith([]);
                expect(failureCallback).not.toHaveBeenCalled();
            });
        });
    });
});
