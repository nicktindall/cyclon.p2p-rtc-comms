'use strict';

const {SignallingServerBootstrap} = require("../lib/SignallingServerBootstrap");
const ClientMocks = require("./ClientMocks");

describe("The signalling server bootstrap", () => {

    const SIGNALLING_SERVERS = [
        {
            signallingApiBase: "http://one"
        },
        {
            signallingApiBase: "http://two"
        }
    ];

    const NODE_ID = "NODE_ID",
        LIMIT = 50,
        ROOMS_TO_BOOTSTRAP_FROM = ['theroom', 'theotherroom'];

    let bootstrap,
        signallingSocket,
        httpRequestService,
        cyclonNode,
        serverOneResponse,
        serverTwoResponse;

    let successCallback,
        failureCallback;

    beforeEach(() => {
        successCallback = ClientMocks.createSuccessCallback();
        failureCallback = ClientMocks.createFailureCallback();

        cyclonNode = ClientMocks.mockCyclonNode();
        signallingSocket = ClientMocks.mockSignallingSocket();
        httpRequestService = ClientMocks.mockHttpRequestService();

        //
        // Mock behaviour
        //
        signallingSocket.getCurrentServerSpecs.and.returnValue(SIGNALLING_SERVERS);
        cyclonNode.getId.and.returnValue(NODE_ID);
        httpRequestService.get.and.callFake((url) => {
            if (url.indexOf("http://one/api/peers") === 0) {
                return serverOneResponse;
            } else if (url.indexOf("http://two/api/peers") === 0) {
                return serverTwoResponse;
            }
            throw new Error("Something weird happened");
        });

        bootstrap = new SignallingServerBootstrap(signallingSocket, httpRequestService, ROOMS_TO_BOOTSTRAP_FROM);
    });

    describe('constructor', () => {

        it('will throw an error if no rooms to bootstrap from are specified', () => {
            try {
                new SignallingServerBootstrap(signallingSocket, httpRequestService, []);
            } catch (e) {
                expect(e).toEqual(new Error('Must specify at least one room to bootstrap from'));
            }
        });
    });

    describe("when fetching initial peer sets", () => {

        it("returns combined results from all servers that respond", (done) => {

            serverOneResponse = Promise.resolve({
                NODE_ID: {id: NODE_ID},
                NODE_ID_ONE: {id: "NODE_ID_ONE"}
            });
            serverTwoResponse = Promise.resolve({
                NODE_ID: {id: NODE_ID},
                NODE_ID_TWO: {id: "NODE_ID_TWO"}
            });

            bootstrap.getInitialPeerSet(cyclonNode, LIMIT).then((result) => {
                expect(result).toEqual([
                    {id: "NODE_ID_ONE"},
                    {id: "NODE_ID_TWO"}
                ]);
                done();
            });
        });

        it("restricts the number of peers returned to that requested", (done) => {

            serverOneResponse = Promise.resolve({
                NODE_ID: {id: NODE_ID},
                NODE_ID_ONE: {id: "NODE_ID_ONE"}
            });
            serverTwoResponse = Promise.resolve({
                NODE_ID: {id: NODE_ID},
                NODE_ID_TWO: {id: "NODE_ID_TWO"}
            });

            bootstrap.getInitialPeerSet(cyclonNode, 1).then((result) => {
                expect(result.length).toBe(1);
                done();
            });
        });

        it("returns an empty array when no results are returned", (done) => {

            serverOneResponse = Promise.reject(new Error("dumb"));
            serverTwoResponse = Promise.reject(new Error("dumber"));

            bootstrap.getInitialPeerSet(cyclonNode, LIMIT).then((result) => {
                expect(result).toEqual([]);
                done();
            });
        });

        it('randomly chooses a room to sample from', async () => {
            const urls = [];
            httpRequestService.get.and.callFake((url) => {
                urls.push(url);
            });
            let randomSpy = spyOn(Math, 'random');
            randomSpy.and.returnValue(0.7);
            await bootstrap.getInitialPeerSet(cyclonNode, 1);
            expect(urls[0]).toContain(ROOMS_TO_BOOTSTRAP_FROM[1]);
            expect(urls[1]).toContain(ROOMS_TO_BOOTSTRAP_FROM[1]);

            randomSpy.and.returnValue(0.2);
            await bootstrap.getInitialPeerSet(cyclonNode, 1);
            expect(urls[2]).toContain(ROOMS_TO_BOOTSTRAP_FROM[0]);
            expect(urls[3]).toContain(ROOMS_TO_BOOTSTRAP_FROM[0]);
        });
    });
});
