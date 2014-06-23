'use strict';

var cyclon = require("cyclon.p2p");
var cyclonWebrtc = require("../lib/builder.js");
var NodeJsRTCObjectFactory = require("../lib/NodeJsRTCObjectFactory.js");

describe("The Cyclon-webrtc export", function() {

	it("exports a builder function", function() {
		expect(cyclonWebrtc.builder).toEqual(any(Function));
	});

	describe("the builder", function() {

		it("builds CyclonNodes", function() {
			expect(cyclonWebrtc.builder().build() instanceof cyclon.CyclonNode).toBeTruthy();
		});

		it("allows the specification of the preferred number of sockets", function() {
			expect(cyclonWebrtc.builder().withPreferredNumberOfSockets(3).build() instanceof cyclon.CyclonNode).toBeTruthy();
		});

		it("allows the specification of the logger", function() {
			expect(cyclonWebrtc.builder().withLogger(new cyclon.ConsoleLogger()).build() instanceof cyclon.CyclonNode).toBeTruthy();
		});

		it("allows the specification of the storage", function() {
			expect(cyclonWebrtc.builder().withStorage(new cyclon.InMemoryStorage()).build() instanceof cyclon.CyclonNode).toBeTruthy();
		});

		it("allows the specification of the RTCObjectFactory", function() {
			expect(cyclonWebrtc.builder().withRTCObjectFactory(new NodeJsRTCObjectFactory()).build() instanceof cyclon.CyclonNode).toBeTruthy();
		});

		it("allows the specification of the metadata provicers", function() {
			expect(cyclonWebrtc.builder().withMetadataProviders([]).build() instanceof cyclon.CyclonNode).toBeTruthy();
		});
	});
});