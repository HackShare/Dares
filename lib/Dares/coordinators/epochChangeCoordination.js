/**
 *
 * epochChangeCoordination.js
 * ==========================
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements the epoch chang operation.
 *
 */

'use strict';

var util = require( '../utility.js' );
var node = require( '../logic/node.js' );


var EpochChangeCoordination = function ( coordination, p ) {
    this.coordination = coordination;
    this.process = p;
    this.options = coordination.options;
};


/**
 * ##_voteForEpochChange
 * will be called in direct succeeding to the changeEpoch method.
 * It's purpose is to vote for a write of a new epoch
 */
EpochChangeCoordination.prototype._voteForEpochChange = function () {
    if ( this.coordination.state.name !== 'beginEpochChange' ) {
        throw new Error( 'Wrong state, expected "beginEpochChange" but got ' + this.coordination.state.name );
    }

    //updating the state
    this.coordination.state = {
        name: 'waitForAllLocks',
        quorum: this.coordination.state.quorum,
        newRoot: this.coordination.state.newRoot,
        newProcessList: this.coordination.state.newProcessList,
        retryEpochChange: this.coordination.state.retryEpochChange,
        outdatedMembers: [],
        receivedLocks: 0,
        deniedLocks: 0,
        lockedProcesses: [],
        keyVersions: {},
        upToDateProcess: this.process.getMeAsJson()
    };
    this.coordination.state.upToDateProcess.epoch = this.coordination.epoch;


    //timeout for locks. Currently this timeout just pings
    //all processes again and tries the epoch change again.  
    this.coordination.state.timeout = setTimeout( function () {
        this.process.logger.verbose( 'Cancelling....' );
        if ( this.coordination.state && this.coordination.state.name === 'waitForAllLocks' ) {
            this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, this.coordination._getAbortEpochChangeMsg() );
            this.process.logger.warn( 'voting aborted, timeout for epoch locks reached' );

            if ( this.coordination._coordinatorHasNewestEpoch( this.coordination.state, this.coordination.epoch ) ) {
                this.coordination.state.name = 'idle';
                this.coordination._testProcesses();
            } else {
                this.coordination._updateMeTo( this.coordination.state.upToDateProcess );
            }
        }
    }.bind( this ), this.options.coordination.epochChange.lock.timeout );

    //send the request to vote for this epoch change
    //and wait for answers to come in
    var json = {
        action: 'voteForEpochChange',
        port: this.process.port
    };

    this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, json );
};

/**
 * ##_processAllLock
 *
 * @param {boolean} positive - boolean whether or not the lock was achieved
 * @param {object} data - json object, containing  
 *  `currentProcess:` the process that casted this vote  
 *  `epoch:` its epoch  
 *  `keyVersion:` a json object, containing all saved keys of the sending process with their values version
 */
EpochChangeCoordination.prototype._processAllLock = function ( positive, data ) {
    var currentProcess = data.process;
    var epoch = data.epoch;
    //process the incoming vote,  
    //  **-> alters the state**
    //
    //a negative voting process will be added to the busy list,
    //a positive voter's epoch will be checked and his key-version pairs are saved
    this._collectVotes( positive, currentProcess, data.keyVersion );

    this.coordination._checkEpochOfVoter( this.coordination.state, epoch, currentProcess );

    if ( this._allLocksReceived() ) {
        //timeout has served it's duty, we got all votes
        clearTimeout( this.coordination.state.timeout );

        if ( this.coordination._coordinatorHasNewestEpoch( this.coordination.state, this.coordination.epoch ) ) {
            if ( this._noDeniedLocks() ) {
                //in the case that the coordinator has the newest epoch, and no negative
                //votes were received, coordinator can now update it's replicas
                this._updateItsReplicas();
            } else {
                //we got negative votes, abort
                this.process.tunnel.createBatchAndSend( this.coordination.state.lockedProcesses,
                    this.coordination._getAbortEpochChangeMsg() );
                //If it was a read, we can try to ignore the failed processes and
                //try again to find a read quorum
                if ( this.coordination.currentBaseOperation.type === 'read' ) {
                    this.coordination.currentBaseOperation();
                } else if ( this.coordination.currentBaseOperation.type === 'write' ) {
                    //same for the write
                    this.coordination.currentBaseOperation();
                } else {
                    //otherwise this was started by a registration process and we have to send back an error
                    //that the registration was not successful.  
                    var newProcess = this.coordination.forceInclude[this.coordination.forceInclude.length - 1];
                    var json = {
                        action: 'notAdded'
                    };
                    this.process.tunnel.send( json, newProcess.address, newProcess.port );
                    this.coordination.forceInclude = util.deleteById( newProcess.id, this.coordination.forceInclude );
                }
            }
        } else {
            // if the current coordinator has not the newest epoch,
            // it aborts the write,
            this.process.tunnel.createBatchAndSend( this.coordination.state.lockedProcesses, this.coordination._getAbortEpochChangeMsg() );
            // and requests an update from the newest process.  The completed Update
            // will trigger the current base operation. The current epoch change will be 
            // discarded, as the new epoch may already have the changes
            this.coordination._updateMeTo( this.coordination.state.upToDateProcess );
        }
    }
};


/**
 * ##_collectVotes
 * processes the received answer:  
 *  updates the counters and adds the answering process to the available respectively busy list  
 * if the vote was positive, the information about the highest epoch and the owning process is 
 *  updated if necessary
 *  and the received keyVersion information is saved
 * 
 * @param {boolean} positive - boolean whether the vote is positive or not
 * @param {Process} currentProcess - process that casted the vote
 * @param {object} keyVersion - object, which contains all keys and related versions of casting process
 */
EpochChangeCoordination.prototype._collectVotes = function ( positive, currentProcess, keyVersion ) {
    if ( positive ) {
        this.coordination.state.keyVersions[currentProcess.id] = keyVersion;
        this.coordination.state.receivedLocks++;
        this.coordination.state.lockedProcesses.push( currentProcess );
    } else {
        this.coordination.state.deniedLocks++;
        this.coordination.busy.push( currentProcess );
    }
};


/**
 * ##_allLocksReceived
 *
 * @return {boolean}
 */
EpochChangeCoordination.prototype._allLocksReceived = function () {
    return this.coordination.state.receivedLocks + this.coordination.state.deniedLocks === this.coordination.state.quorum.length;
};

/** 
 * ##_noDeniedLocks
 * Does _not_ check, if all votes already came in!
 * 
 * @return {boolean}
 */
EpochChangeCoordination.prototype._noDeniedLocks = function () {
    return this.coordination.state.deniedLocks === 0;
};


/**
 * ##_updateItsReplicas
 * is the function to determine outdated key-value pairs and update them  
 * intermediate step between voting and preparing to commit stages of 3PC
 */
EpochChangeCoordination.prototype._updateItsReplicas = function () {
    this.process.logger.verbose( 'Update the Replicas' );
    // the maximal version number for every key (plus the owning process) is computed ...
    var keyVersionMax = this._updateItsReplicas._computeKeyMaxVersion( this.coordination.state.keyVersions );
    // ... and compared against the local replicas
    var resObj = this._determineOutdatedKeys( keyVersionMax );

    var outdatedReplicas = resObj.outdated;
    var necessary = resObj.necessary;

    //updating the state
    this.coordination.state = {
        name: 'waitForUpdates',
        quorum: this.coordination.state.quorum,
        newRoot: this.coordination.state.newRoot,
        newProcessList: this.coordination.state.newProcessList,
        keyVersions: this.coordination.state.keyVersions,
        keyVersionMax: keyVersionMax,
        updates: 0,
        necessary: necessary
    };

    //if some updates are necessary, request the newer version,  
    //otherwise push the new quorum system with all current replicas to the quorum
    if ( necessary ) {
        this._requestUpdates( outdatedReplicas );
    } else {
        this._preCommitUpdatesToQuorum();
    }
};


/**
 * ###_computeKeyMaxVersion
 * Cycles through the keyVersion object and determines the maximal versions for all keys.
 * 
 * @param {object} keyVersions - object containing all key-version objects for the quorum processes
 * @return {object}
 */
EpochChangeCoordination.prototype._updateItsReplicas._computeKeyMaxVersion = function ( keyVersions ) {
    var result = {};
    for ( var id in keyVersions ) {
        if ( keyVersions.hasOwnProperty( id ) ) {
            for ( var key in keyVersions[id] ) {
                if ( keyVersions[id].hasOwnProperty( key ) &&
                    typeof keyVersions[id][key].version !== 'undefined' ) {
                    if ( !result[key] ) {
                        result[key] = {
                            version: keyVersions[id][key].version,
                            id: id
                        };
                    } else {
                        if ( result[key].version < keyVersions[id][key].version ) {
                            result[key] = {
                                version: keyVersions[id][key].version,
                                id: id
                            };
                        }
                    }
                }
            }
        }
    }
    return result;
};


/**
 * ##_determineOutdatedKeys
 * computes the outdated keys for this replica, along with the information how many keys need to
 * be updated
 * 
 * @param {object} keyVersionMax - object containing the maximal version and owning process for every key
 * @return {object}
 */
EpochChangeCoordination.prototype._determineOutdatedKeys = function ( keyVersionMax ) {
    /**
     * ###_keyIsOutdated
     *
     * @param {string} key - The key to check
     * @return {boolean}
     */
    var keyIsOutdated = function ( key ) {
        return ( !this.coordination.state.keyVersions[this.process.id] || 
            !this.coordination.state.keyVersions[this.process.id][key] ||
            keyVersionMax[key].version > this.coordination.state.keyVersions[this.process.id][key].version );
    }.bind( this );
    var result = {};
    var necessary = 0;
    for ( var key in keyVersionMax ) {
        if ( keyVersionMax.hasOwnProperty( key ) ) {
            if ( keyIsOutdated( key ) ) {
                result[key] = keyVersionMax[key];
                necessary++;
            }
        }
    }

    return {
        outdated: result,
        necessary: necessary
    };
};


/**
 * ##_requestUpdates
 * requests a plain read for every outdated key (without any check for locks, as the complete quorum
 * is locked for the epoch change) on one process which has the most recent value for this key
 * 
 * @param {object} outdated - object containing the keys for which the coordinator does not have the most recent version
 */
EpochChangeCoordination.prototype._requestUpdates = function ( outdated ) {
    for ( var key in outdated ) {
        if ( outdated.hasOwnProperty( key ) ) {
            var json = {
                action: 'plainRead',
                data: key,
                port: this.process.port
            };
            var updatedProcess = util.mapIdToProcess( Number( outdated[key].id ), this.coordination.state.quorum );
            this.process.tunnel.send( json, updatedProcess.address, updatedProcess.port );
        }
    }
};


/**
 * ##_processPlainRead
 * takes the received value and writes it directly. This is save, as only newer versions
 * were requested and the whole quorum is locked.  
 * When all updates arrived, the the new quorum system with all current replicas is going 
 * to be pushed to the quorum
 *
 * @param {string} key - the key which was read, ...
 * @param {any} value - ... its value ...
 * @param {number} version - ... and version
 */
EpochChangeCoordination.prototype._processPlainRead = function ( key, value, version ) {
    this.process.storage.write( key, value, version );
    this.coordination.state.updates++;
    if ( this.coordination.state.updates === this.coordination.state.necessary ) {
        this._preCommitUpdatesToQuorum();
    }
};


/**
 * ##_preCommitUpdatesToQuorum
 * Creates a unique patch of key, value, version triples for every process in the
 * quorum and pushes them along with the new voting structure.
 *
 */
EpochChangeCoordination.prototype._preCommitUpdatesToQuorum = function () {
    //updating the state
    this.coordination.state = {
        name: 'preCommitUpdates',
        quorum: this.coordination.state.quorum,
        newRoot: this.coordination.state.newRoot,
        newProcessList: this.coordination.state.newProcessList,
        keyVersions: this.coordination.state.keyVersions,
        keyVersionMax: this.coordination.state.keyVersionMax,
        ack: 0
    };
    this.process.logger.debug( 'preCommit, quorum length: ' + this.coordination.state.quorum.length );

    //we have to delete the parent edges for the new root to be able to send it.  
    //No adding afterwards needed, as this happens when the new quorum system 
    // is going to be installed
    node.deleteParentEdges( this.coordination.state.newRoot );
    //assemble the fitting storage patch for every process in the quorum ...
    var batchMessage = [];
    for ( var i = 0; i < this.coordination.state.quorum.length; i++ ) {
        batchMessage.push( this._createMessageForProcess( i ) );
    }

    // timeout for the case, that the acknowledgements for the epoch change are
    // not received in time
    this.coordination.state.timeout = setTimeout( function () {
        if ( this.coordination.state && this.coordination.state.name === 'preCommitUpdates' ) {
            this.process.logger.warn( 'Commit aborted, timeout reached' );

            this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, this.coordination._getAbortEpochChangeMsg() );
            this.coordination._testProcesses();
        }
    }.bind( this ), this.options.coordination.write.voteForWrite.timeout );

    //... and preCommit it
    this.process.tunnel.sendBatch( batchMessage );
};


/**
 * ##_createMessageForProcess
 *
 * @param {number} i - i'th process in the quorum
 * @return {object}
 */
EpochChangeCoordination.prototype._createMessageForProcess = function ( i ) {
    var currProcess = this.coordination.state.quorum[i];
    //compute the outdated keys for process _i_  
    // if i is the current process we don't need to do anything as it just got updated
    var outdated = {};
    if ( currProcess.id !== this.process.id ) {
        outdated = this._getOutdatedKeysForId(
            this.coordination.state.keyVersions,
            this.coordination.state.keyVersionMax,
            currProcess.id );
    }
    //and create the fitting storagePatch ...
    var storagePatch = this.process.storage.multiRead( outdated );
    var json = {
            action: 'preCommitEpochData',
            data: {
                epoch: this.process.dataReplicationCoordinator.epoch + 1,
                root: this.coordination.state.newRoot,
                storagePatch: storagePatch,
                allProcesses: this.coordination.state.newProcessList
            },
            port: this.process.port
        };
    return {
        message: json,
        ip: currProcess.address,
        port: currProcess.port
    };
};


/**
 * ##_getOutdatedKeysForId
 * 
 * @param {object} keyVersions - object containing all key-version objects for the quorum processes
 * @param {object} keyVersionMax - object containing the maximal version and owning process for every key
 * @param {number} id - id to compute outdated keys for
 */
EpochChangeCoordination.prototype._getOutdatedKeysForId = function ( keyVersions, keyVersionMax, id ) {
    var result = [];
    for ( var key in keyVersionMax ) {
        if ( keyVersionMax.hasOwnProperty( key ) ) {
            if ( keyIsOutdated( key ) ) {
                result.push( key );
            }
        }
    }
    //###_keyIsOutdated
    function keyIsOutdated ( key ) {
        return ( !keyVersions[id] || !keyVersions[id][key] ||
            keyVersionMax[key].version > keyVersions[id][key].version );
    }

    return result;
};


/**
 * ##_epochAcknowledged
 * finally collects the answers to the epoch change message and continues with the operation
 * 
 */
EpochChangeCoordination.prototype._epochAcknowledged = function () {
    if ( this.coordination.state.name !== 'preCommitUpdates' ) {
        return;
    }
    this.coordination.state.ack++;
    if ( this.coordination.state.ack === this.coordination.state.quorum.length ) {
        clearTimeout( this.coordination.state.timeout );
        var json = {
            action: 'commitEpochChange',
            port: this.process.port
        };
        this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, json );

        this.coordination.forceInclude = [];
        if ( this.coordination.currentBaseOperation ) {
            this.coordination.currentBaseOperation();
        }
    }
};

module.exports = EpochChangeCoordination;
