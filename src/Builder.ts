import {Bootstrap, Comms} from 'cyclon.p2p';
import {WebRTCComms} from './WebRTCComms';
import {ShuffleStateFactory} from './ShuffleStateFactory';
import {asyncExecService, consoleLogger, Logger, newInMemoryStorage} from 'cyclon.p2p-common';
import {
    DEFAULT_CHANNEL_STATE_TIMEOUT_MS,
    DEFAULT_ICE_SERVERS,
    DEFAULT_SIGNALLING_SERVER_RECONNECT_DELAY_MS,
    DEFAULT_SIGNALLING_SERVERS,
    HttpRequestService,
    rtcBuilder
} from 'cyclon.p2p-rtc-client';
import {SignallingServerBootstrap} from './SignallingServerBootstrap';
import {SignallingServerSpec} from 'cyclon.p2p-rtc-client/lib/SignallingServerSpec';

interface BuilderResult {
    comms: Comms,
    bootstrap: Bootstrap
}

export class Builder {

    private logger?: Logger;
    private result?: BuilderResult;
    private signallingServers?: SignallingServerSpec[];
    private storage?: Storage;
    private reconnectDelayInMillis?: number;
    private channelStateTimeoutMillis?: number;
    private iceServers?: RTCIceServer[];

    withLogger(logger: Logger): Builder {
        this.logger = logger;
        return this;
    }

    withSignallingServers(signallingServerSpecs: SignallingServerSpec[]): Builder {
        this.signallingServers = signallingServerSpecs;
        return this;
    }

    withStorage(storage: Storage): Builder {
        this.storage = storage;
        return this;
    }

    withSignallingServerReconnectDelay(reconnectDelayInMillis: number): Builder {
        this.reconnectDelayInMillis = reconnectDelayInMillis;
        return this;
    }

    withChannelStateChangeTimeout(channelStateTimeoutMillis: number): Builder {
        this.channelStateTimeoutMillis = channelStateTimeoutMillis;
        return this;
    }

    withIceServers(iceServers: RTCIceServer[]): Builder {
        this.iceServers = iceServers;
        return this;
    }

    build(): BuilderResult {
        if (!this.result) {
            this.result = this.doBuild();
        }
        return this.result;
    }

    private doBuild(): BuilderResult {
        const rtcBuilderResult = rtcBuilder()
            .withLogger(this.getLogger())
            .withStorage(this.getStorage())
            .withSignallingServers(this.getSignallingServers())
            .withIceServers(this.getIceServers())
            .withChannelStateChangeTimeout(this.getChannelStateTimeout())
            .withSignallingServerReconnectDelay(this.getReconnectDelay())
            .build();
        const shuffleStateFactory = new ShuffleStateFactory(this.getLogger(), asyncExecService());
        return {
            comms: new WebRTCComms(rtcBuilderResult.rtc, shuffleStateFactory, this.getLogger()),
            bootstrap: new SignallingServerBootstrap(rtcBuilderResult.signallingSocket, new HttpRequestService())
        }
    }

    private getIceServers() {
        return this.iceServers === undefined ? DEFAULT_ICE_SERVERS : this.iceServers;
    }

    private getChannelStateTimeout() {
        return this.channelStateTimeoutMillis === undefined ? DEFAULT_CHANNEL_STATE_TIMEOUT_MS : this.channelStateTimeoutMillis;
    }

    private getReconnectDelay(): number {
        return this.reconnectDelayInMillis === undefined ? DEFAULT_SIGNALLING_SERVER_RECONNECT_DELAY_MS : this.reconnectDelayInMillis;
    }

    private getLogger() {
        return this.logger || consoleLogger();
    }

    private getStorage() {
        if (!this.storage) {
            this.storage = newInMemoryStorage();
        }
        return this.storage;
    }

    private getSignallingServers(): SignallingServerSpec[] {
        return this.signallingServers === undefined ? JSON.parse(JSON.stringify(DEFAULT_SIGNALLING_SERVERS)) : this.signallingServers;
    }
}