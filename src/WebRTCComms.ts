import {CyclonNode, CyclonNodePointer, MetadataProvider} from 'cyclon.p2p';
import {RTC, WebRTCCyclonNodePointer, Channel} from 'cyclon.p2p-rtc-client';
import {Logger, TimeoutError} from 'cyclon.p2p-common';
import {ShuffleStateFactory} from './ShuffleStateFactory';
import {OutgoingShuffleState} from './OutgoingShuffleState';

const CYCLON_SHUFFLE_CHANNEL_TYPE = 'cyclonShuffle';

export class WebRTCComms {

    private localNode?: CyclonNode;
    private currentOutgoingShuffle?: Promise<void>;
    private lastShuffleNode?: CyclonNodePointer;

    constructor(private readonly rtc: RTC,
                private readonly shuffleStateFactory: ShuffleStateFactory,
                private readonly logger: Logger) {
    }

    /**
     * Initialize the Comms object
     *
     * @param localNode The local Cyclon node
     * @param metadataProviders
     */
    initialize(localNode: CyclonNode, metadataProviders: { [key: string]: MetadataProvider }) {
        this.localNode = localNode;
        this.rtc.connect(metadataProviders, ["CyclonWebRTC"]);
        this.rtc.onChannel("cyclonShuffle", (channel) => this.handleIncomingShuffle(channel));
        this.rtc.on("incomingTimeout", (channelType: string, sourcePointer: CyclonNodePointer) => {
            if(channelType === CYCLON_SHUFFLE_CHANNEL_TYPE) {
                this.requireLocalNode().emit("shuffleTimeout", "incoming", sourcePointer);
            }
        });
        this.rtc.on("incomingError", (channelType, sourcePointer, error) => {
            if(channelType === CYCLON_SHUFFLE_CHANNEL_TYPE) {
                this.logger.error('An error occurred on an incoming shuffle', error);
                this.requireLocalNode().emit("shuffleError", "incoming", sourcePointer, error);
            }
        });
        this.rtc.on("offerReceived", (channelType, sourcePointer) => {
            if(channelType === CYCLON_SHUFFLE_CHANNEL_TYPE) {
                this.logger.debug(`Incoming shuffle starting with ${sourcePointer.id}`);
                this.requireLocalNode().emit("shuffleStarted", "incoming", sourcePointer);
            }
        });
    }

    /**
     * Send a shuffle request to another node
     *
     * @param destinationNodePointer
     * @param shuffleSet
     */
    async sendShuffleRequest(destinationNodePointer: WebRTCCyclonNodePointer, shuffleSet: WebRTCCyclonNodePointer[]): Promise<void> {
        this.lastShuffleNode = destinationNodePointer;
        return await this.createOutgoingShuffle(
            this.shuffleStateFactory.createOutgoingShuffleState(this.requireLocalNode(), destinationNodePointer, shuffleSet),
            destinationNodePointer);
    }

    private async createOutgoingShuffle(outgoingState: OutgoingShuffleState, destinationNodePointer: WebRTCCyclonNodePointer): Promise<void> {
        try {
            const channel = await this.rtc.openChannel(CYCLON_SHUFFLE_CHANNEL_TYPE, destinationNodePointer);
            outgoingState.storeChannel(channel);
            outgoingState.sendShuffleRequest();
            await outgoingState.processShuffleResponse();
            await outgoingState.sendResponseAcknowledgement();
        } finally {
            outgoingState.close();
        }
    }

    createNewPointer(): CyclonNodePointer {
        return this.rtc.createNewPointer();
    }

    getLocalId() {
        return this.rtc.getLocalId();
    }

    /**
     * Handle an incoming shuffle
     */
    async handleIncomingShuffle(channel: Channel): Promise<void> {
        const remotePeer = channel.getRemotePeer();

        const incomingShuffleState = this.shuffleStateFactory.createIncomingShuffleState(this.requireLocalNode(), remotePeer);

        try {
            await incomingShuffleState.processShuffleRequest(channel);
            await incomingShuffleState.waitForResponseAcknowledgement(channel);
            this.requireLocalNode().emit("shuffleCompleted", "incoming", remotePeer);
        } catch (e) {
            if (e instanceof TimeoutError) {
                this.logger.warn(e.message);
                this.requireLocalNode().emit("shuffleTimeout", "incoming", remotePeer);
            } else {
                this.logger.error("An unknown error occurred on an incoming shuffle", e);
                this.requireLocalNode().emit("shuffleError", "incoming", remotePeer, "unknown");
            }
        } finally {
            channel.close();
        }
    }

    private requireLocalNode(): CyclonNode {
        if (this.localNode) {
            return this.localNode;
        } else {
            throw new Error("Comms not yet initialized (localNode is not defined)");
        }
    }
}
