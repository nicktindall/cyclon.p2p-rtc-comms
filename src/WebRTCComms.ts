import {Promise} from 'bluebird';
import {CyclonNode, CyclonNodePointer, MetadataProvider} from 'cyclon.p2p';
import {RTC, WebRTCCyclonNodePointer, Channel} from 'cyclon.p2p-rtc-client';
import {Logger} from 'cyclon.p2p-common';
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
    sendShuffleRequest(destinationNodePointer: WebRTCCyclonNodePointer, shuffleSet: WebRTCCyclonNodePointer[]): Promise<void> {

        if (this.currentOutgoingShuffle && this.currentOutgoingShuffle.isPending()) {
            this.logger.warn(`Previous outgoing request timed out (to ${(this.lastShuffleNode as CyclonNodePointer).id})`);
            this.currentOutgoingShuffle.cancel();
        }

        this.lastShuffleNode = destinationNodePointer;
        this.currentOutgoingShuffle = this.createOutgoingShuffle(
            this.shuffleStateFactory.createOutgoingShuffleState(this.requireLocalNode(), destinationNodePointer, shuffleSet),
            destinationNodePointer);

        return this.currentOutgoingShuffle as Promise<void>;
    }

    private createOutgoingShuffle(outgoingState: OutgoingShuffleState, destinationNodePointer: WebRTCCyclonNodePointer): Promise<void> {
        return this.rtc.openChannel(CYCLON_SHUFFLE_CHANNEL_TYPE, destinationNodePointer)
            .then((channel) => outgoingState.storeChannel(channel))
            .then(() => outgoingState.sendShuffleRequest())
            .then(() => outgoingState.processShuffleResponse())
            .then(() => outgoingState.sendResponseAcknowledgement())
            .cancellable()
            .catch(Promise.CancellationError, function (e) {
                outgoingState.cancel();
                throw e;
            })
            .finally(function() {
                outgoingState.close();
            });
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
    handleIncomingShuffle(channel: Channel): Promise<void> {
        const remotePeer = channel.getRemotePeer();

        const incomingShuffleState = this.shuffleStateFactory.createIncomingShuffleState(this.requireLocalNode(), remotePeer);

        return incomingShuffleState.processShuffleRequest(channel)
            .then((channel) => incomingShuffleState.waitForResponseAcknowledgement(channel))
            .then(() => {
                this.requireLocalNode().emit("shuffleCompleted", "incoming", remotePeer);
            })
            .catch(Promise.TimeoutError, (e) => {
                this.logger.warn(e.message);
                this.requireLocalNode().emit("shuffleTimeout", "incoming", remotePeer);
            })
            .catch((error) => {
                this.logger.error("An unknown error occurred on an incoming shuffle", error);
                this.requireLocalNode().emit("shuffleError", "incoming", remotePeer, "unknown");
            })
            .finally(() => {
                incomingShuffleState.close();
                channel.close();
            });
    }

    private requireLocalNode(): CyclonNode {
        if (this.localNode) {
            return this.localNode;
        } else {
            throw new Error("Comms not yet initialized (localNode is not defined)");
        }
    }
}
