import {IncomingShuffleState} from './IncomingShuffleState';
import {OutgoingShuffleState}  from './OutgoingShuffleState';
import {AsyncExecService, Logger} from 'cyclon.p2p-common';
import {CyclonNode, CyclonNodePointer} from 'cyclon.p2p';

export class ShuffleStateFactory{

    constructor(private readonly logger: Logger,
                private readonly asyncExecService: AsyncExecService) {
    }

    /**
     * Create a new outgoing shuffle state
     *
     * @param localNode The local Cyclon node
     * @param destinationNodePointer The pointer to the destination node
     * @param shuffleSet The set of node pointers to send in the request
     * @returns {OutgoingShuffleState}
     */
    createOutgoingShuffleState(localNode: CyclonNode, destinationNodePointer: CyclonNodePointer, shuffleSet: CyclonNodePointer[]) {
        return new OutgoingShuffleState(localNode, destinationNodePointer, shuffleSet, this.asyncExecService, this.logger);
    }

    /**
     * Create a new incoming shuffle state
     *
     * @param localNode The local Cyclon node
     * @param sourcePointer The source peer's node pointer
     * @returns {IncomingShuffleState}
     */
    createIncomingShuffleState(localNode: CyclonNode, sourcePointer: CyclonNodePointer) {
        return new IncomingShuffleState(localNode, sourcePointer, this.asyncExecService, this.logger);
    }
}
