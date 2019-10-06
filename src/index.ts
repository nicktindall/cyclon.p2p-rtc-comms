import {WebRTCComms} from './WebRTCComms';
import {ShuffleStateFactory} from './ShuffleStateFactory';
import {SignallingServerBootstrap} from './SignallingServerBootstrap';

export {ShuffleStateFactory, SignallingServerBootstrap, WebRTCComms}

/**
 * Build the angular cyclon-rtc-comms module
 *
 * @deprecated This is going to go very soon
 *
 * @param angular The angular core module
 * @returns {*}
 */
// @ts-ignore
export function buildAngularModule(angular: any): any {
    const rtcCommsModule = angular.module("cyclon-rtc-comms", ["cyclon-rtc"]);

    rtcCommsModule.service("Comms", ["RTC", "ShuffleStateFactory", "$log", WebRTCComms]);
    rtcCommsModule.service("ShuffleStateFactory", ["$log", "AsyncExecService", ShuffleStateFactory]);
    rtcCommsModule.service("Bootstrap", ["SignallingSocket", "HttpRequestService", SignallingServerBootstrap]);

    return rtcCommsModule;
}
