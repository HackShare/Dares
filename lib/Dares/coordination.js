/**
 *
 * coordination.js
 * ===============
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements the quorum creation, epoch changes and related methods.
 *
 */

'use strict';

//
var assert = require( 'assert' );

var quorum = require( './logic/quorum.js' );
var node = require( './logic/node.js' );
var util = require( './utility.js' );
var addParentEdges = require( './logic/node.js' ).addParentEdges;
var deleteParentEdges = require( './logic/node.js' ).deleteParentEdges;

var Coordination = function ( process ) {
    var that = this;
    this.process = process;
    this.options = process.options;

    //initializing the base operation. This function is later set to
    //the current read or write Operation  
    this.currentBaseOperation = function () {
        that.state = {name: 'idle'};
    };
    this.currentBaseOperation.name = 'idle';

    this.epoch = 0;
    this.root = undefined;

    //the heart of the coordinator, it's state. Initialized to 'idle'
    this.state = {name: 'idle'};
    this.gotAnEpochChange = function () {};

    // list of currently busy processes
    this.busy = [];
    // force Include list
    this.forceInclude = [];
};


/**
 * ##_abortTemplate
 * This is a template function for abortion of the current operation.
 *
 * @param {string} action - the current action
 * @return {object}
 */
Coordination.prototype._abortTemplate = function ( action ) {
    return {
        action: 'abort' + action,
        data: this.state.key
    };
};

/**
 * ##_getAbortWriteMsg
 * Predefined abortion message for writing.
 *
 * @return {object}
 */
Coordination.prototype._getAbortWriteMsg = function () {
    return this._abortTemplate( 'Write' );
};

/**
 * ##_getAbortCommitMsg
 * Predefined abortion message for committing a write.
 *
 * @return {object}
 */
Coordination.prototype._getAbortCommitMsg = function () {
    return this._abortTemplate( 'Commit' );
};

/**
 * ##_getAbortReadMsg
 * Predefined abortion message for reading.
 *
 * @return {object}
 */
Coordination.prototype._getAbortReadMsg = function () {
    return this._abortTemplate( 'Read' );
};

/**
 * ##_getAbortEpochChangeMsg
 * Predefined abortion message for epoch changing.
 *
 * @return {object}
 */
Coordination.prototype._getAbortEpochChangeMsg = function () {
    return this._abortTemplate( 'EpochUpdate' );
};


/**
 * ##_setBaseOperation
 * Is a template function to save the current read or write operation.
 *
 * @param {function} operation - a function that re-performs the current read or write
 * @param {function} useResult - function to be called after successful read or write. After a successful read,
 *  useResult is called with the read value and after a successful write, it's called with true.
 *  If the operation didn't succeed, it's called with false and an error message as second parameter
 * @param {string} type - type of the operation to be retried
 * @return {number}
 */
Coordination.prototype._setBaseOperation = function ( operation, useResult, type ) {
    var saveAttempts;
    if ( this.currentBaseOperation && this.currentBaseOperation.attempt ) {
        saveAttempts = this.currentBaseOperation.attempt + 1;
    } else {
        saveAttempts = 1;
    }
    var attempt = saveAttempts;
    
    this.currentBaseOperation = function () {
        this.state = {name: 'idle'};
        this.process.logger.verbose( 'beginning attempt ' + saveAttempts );
        operation();
    }.bind( this );

    this.currentBaseOperation.attempt = saveAttempts;
    this.currentBaseOperation.useResult = useResult;
    this.currentBaseOperation.type = type;
    return attempt;
};


/**
 * ##write
 * initializes a write operation, implementing a
 * [3PC](http://en.wikipedia.org/wiki/Three-phase_commit_protocol 'Three Phase Commit')  
 *
 * @param {string} key - some valid json key to look up the value
 * @param {any} value - either a number, a string or some json object
 * @param {function} useResult - function to be called after successful write. After a successful write, it's called with true.
 *  If the operation didn't succeed, it's called with false and an error message as second parameter
 */
Coordination.prototype.write = function ( key, value, useResult ) {
    var that = this;

    useResult = useResult || function () {
    };
    if ( this.state.name !== 'idle' ) {
        useResult( {error: 'Cannot start write because there is currently an operation in progress: ' + this.state.name + ' ' + this.state.key } );
    } else {

        //set the state
        this.state = {name: 'beginWrite',
            key: key,
            value: value,
            useResult: useResult
        };

        // set the current base operation as a function that re-performs
        // the current write operation in case it has to be interrupted by an epoch change.  
        // local variable attempt only for logging purposes
        var attempt = this._setBaseOperation(  function () {
                that.write( key, value, useResult );
            },
            useResult, 'write' );
        this.process.logger.verbose( 'write called on process [%d] in epoch [%d] with key [%s] and value [%s], attempt [%d]',
            this.process.id, this.epoch, key, value, attempt );

        //get a quorum for writing, busy process list has to be empty as it's not feasible to search a write
        //quorum when there's a read or write in progress, but try to include that process
        this.state.quorum = quorum.build( this.root, 'write', [], [this.process.getMeAsJson()] );
        this.process.logger.verbose( 'write quorum is: ' + util.extractIds( this.state.quorum ) );

        //visualize the quorum.  
        //This assumes, that the `options.voting.StructureGenerator` is providing an up-to-date
        //list of generators to use
        var render = this.options.voting.StructureGeneratorRender( this.process.allProcesses.length );
        this.process.logger.verbose(
            '--------------Writing---------------\n' +
            render( this.state.quorum, this.process.allProcesses, [this.process.getMeAsJson()] ) +
            '\n         ------------------------------------'
        );
        //if no quorum can be assembled at that point, there is a serious problem...  
        //otherwise the voting process is kicked off
        if ( this.state.quorum.length === 0 ) {
            this._resetCoordinator();
            useResult( {error: 'could not establish quorum with current voting structure'} );
        } else {
            this._vote();
        }
    }
};


/**
 * ##read
 * initializes a read operation
 *
 * @param {string} key - some valid json key to look up the value
 * @param {function} useResult - function to be called after successful read or write. After a successful read,
 *  useResult is called with the read value.
 *  If the operation didn't succeed, it's called with false and an error message as second parameter
 */
Coordination.prototype.read = function ( key, useResult ) {
    var that = this;
    useResult = useResult || function () {
    };

    if ( this.state.name !== 'idle' ) {
        useResult( {error: 'Cannot start read because there is currently an operation in progress: ' + this.state.name + ' ' + this.state.key} );
    } else {

        //set the state
        this.state = {
            name: 'beginRead',
            key: key,
            useResult: useResult
        };

        // set the current base operation as a function that re-performs
        // the current read operation if the allowed attempts are not exceeded
        var attempt = this._setBaseOperation( function () {
                that.read( key, useResult );
            },
            useResult, 'read' );

        this.process.logger.verbose( 'read called on process [%d] in epoch [%d] with key [%s], attempt [%d]',
            this.process.id, this.epoch, key, attempt );


        //get a quorum for reading, excluding the this.busy processes, trying to include that process
        this.state.quorum = quorum.build( this.root, 'read', this.busy, [this.process.getMeAsJson()] );
        this.process.logger.verbose( 'read quorum is: ' + util.extractIds( this.state.quorum ) );

        //visualize the quorum.  
        //This assumes, that the `options.voting.StructureGenerator` is providing an up-to-date
        //list of generators to use
        var render = this.options.voting.StructureGeneratorRender( this.process.allProcesses.length );
        this.process.logger.verbose(
            '---------------Reading--------------\n' +
            render( this.state.quorum, this.process.allProcesses, [this.process.getMeAsJson()], this.busy ) +
            '\n         ------------------------------------'
        );


        // if no quorum can be assembled, the busy process list is too large to get a quorum.
        // an error is returned to the caller.  
        // otherwise the coordinator will try to get the required read locks
        if ( this.state.quorum.length === 0 ) {
            var copyBusy = [].concat( this.busy );
            this._resetCoordinator();
            useResult( { 
                error: 'could not establish quorum because too many processes are busy', 
                busy: copyBusy
            } );
        } else {
            this._lock();
        }
    }
};


/**
 * ##_changeEpoch
 * This method initializes an epoch change.
 * 
 * @param {Process[]} ignoreTheseProcesses - array of failed processes
 */
Coordination.prototype._changeEpoch = function ( ignoreTheseProcesses ) {
    var that = this;

    ignoreTheseProcesses = typeof ignoreTheseProcesses !== 'undefined' ? ignoreTheseProcesses : [];
    // set the function that retries the epoch change. CurrentBaseOperation can not be used,
    // because it's set to the read/write operation that was interrupted by the need for an epoch change
    var retryEpochChange = setEpochChangeRepeatOperation();

    //Prepare the new process list
    var copyOfProcesses = [].concat( this.process.allProcesses );
    var filteredList = util.deleteByIds( util.extractIds( ignoreTheseProcesses ), copyOfProcesses );
    var newProcessList = filteredList.concat( this.forceInclude );

    // determine the root for the new voting structure
    var newRoot = this.options.voting.StructureGenerator( newProcessList.length )( newProcessList );
    // and fusion it with the old root
    var fusionRoot = node.fusionNode( this.root, newRoot );

    //in the case that there are failed processes, we need to ignore them in the quorum build process ...
    if ( ignoreTheseProcesses ) {
        this.busy = this.busy.concat( ignoreTheseProcesses );
        this.busy = util.reduceById( this.busy );
    }
    var fusionQuorum = quorum.build( fusionRoot, 'write', this.busy, [this.process.getMeAsJson()].concat( this.forceInclude ) );
    if ( fusionQuorum.length === 0 ) {
        //can't change the epoch. If it was a read, we can try to ignore the failed processes and
        //try again to find a read quorum
        if ( this.currentBaseOperation.type === 'read' ) {
            this.currentBaseOperation();
        } else if ( this.currentBaseOperation.type === 'write' ) {
            //same for the write
            this.currentBaseOperation();
        } else {
            //otherwise that was started by a registration process and we have to send back an error
            //that the registration was not successful.  
            var newProcess = this.forceInclude[this.forceInclude.length - 1];
            var json = {
                action: 'notAdded'
            };
            this.process.tunnel.send( json, newProcess.address, newProcess.port );
        }

        //this.currentBaseOperation.useResult( false, {error: 'System currently not available'} );
    } else {

        //remember the processes which want to get involved
        //quorum.build just prioritizes the last parameter, but doesn't necessarily include them
        //if they are included anyway, the following lines won't change anything
        this.process.logger.verbose( 'force include: ' + util.extractIds( [this.process.getMeAsJson()].concat( this.forceInclude ) ) );
        fusionQuorum = fusionQuorum.concat( [this.process.getMeAsJson()].concat( this.forceInclude ) );
        fusionQuorum = util.reduceById( fusionQuorum );

        //----render the quorum----  
        //unfortunately we can't visualize the read quorums of the old and new epoch separately, as they are
        //generated in one operation
        var newRender = this.options.voting.StructureGeneratorRender( newProcessList );
        this.process.logger.verbose(
            '---------------Epoch Change---------\n' +
            newRender( fusionQuorum, newProcessList, [this.process.getMeAsJson()].concat( this.forceInclude ), ignoreTheseProcesses ) +
            '\n         ------------------------------------'
        );


        //set the state
        this.state = {
            name: 'beginEpochChange',
            quorum: fusionQuorum,
            newRoot: newRoot,
            newProcessList: newProcessList,
            retryEpochChange: retryEpochChange
        };

        this.process.logger.verbose( 'fusion quorum is ' + util.extractIds( fusionQuorum ) );
        this.process.logger.verbose( 'ignoring ' + util.extractIds( this.busy ) );
        //kick off the voting procedure
        this._voteForEpochChange();

    }

    /**
     * ###_setEpochChangeRepeatOperation
     * retries the current epoch change, attempts are currently without use
     */
    function setEpochChangeRepeatOperation () {

        var saveEpochChangeAttempt;
        if ( that.state && that.state.retryEpochChange ) {
            saveEpochChangeAttempt = that.state.retryEpochChange.attempt + 1;
        } else {
            saveEpochChangeAttempt = 1;
        }

        /**
         * ####_retryOperation
         */
        var retryOperation = function () {
            that._changeEpoch( ignoreTheseProcesses );
        };
        retryOperation.attempt = saveEpochChangeAttempt;
        return retryOperation;
    }
};

//#Epoch Change methods
/*
 */


/**
 * ##_voteForEpochChange
 * will be called in direct succeeding to the changeEpoch method.
 * It's purpose is to vote for a write of a new epoch
 */
Coordination.prototype._voteForEpochChange = function () {
    var that = this;

    assert( this.state.name === 'beginEpochChange',
        'Wrong state, expected "beginEpochChange" but got ' + this.state.name );

    //updating the state
    this.state = {
        name: 'waitForAllLocks',
        quorum: this.state.quorum,
        newRoot: this.state.newRoot,
        newProcessList: this.state.newProcessList,
        retryEpochChange: this.state.retryEpochChange,
        outdatedMembers: [],
        receivedLocks: 0,
        deniedLocks: 0,
        lockedProcesses: [],
        keyVersions: {},
        upToDateProcess: this.process.getMeAsJson()
    };
    this.state.upToDateProcess.epoch = this.epoch;


    //timeout for locks. Currently this timeout just pings
    //all processes again and tries the epoch change again.  
    this.state.timeout = setTimeout( function () {
        this.process.logger.verbose( 'Cancelling....' );
        if ( that.state && that.state.name === 'waitForAllLocks' ) {
            that.process.tunnel.createBatchAndSend( that.state.quorum, that._getAbortEpochChangeMsg() );
            this.process.logger.warn( 'voting aborted, timeout for epoch locks reached' );

            if ( that._coordinatorHasNewestEpoch( that.state, that.epoch ) ) {
                that.state.name = 'idle';
                that._testProcesses();
            } else {
                that._updateMeTo( that.state.upToDateProcess );
            }
        }
    }.bind( this ), this.options.coordination.epochChange.lock.timeout );

    //send the request to vote for this epoch change
    //and wait for answers to come in
    var json = {action: 'voteForEpochChange',
        port: this.process.port};

    this.process.tunnel.createBatchAndSend( this.state.quorum, json );
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
Coordination.prototype._processAllLock = function ( positive, data ) {
    var currentProcess = data.process;
    var epoch = data.epoch;
    //process the incoming vote,  
    //  **-> alters the state**
    //
    //a negative voting process will be added to the busy list,
    //a positive voter's epoch will be checked and his key-version pairs are saved
    this._collectVotes( positive, currentProcess, data.keyVersion );

    this._checkEpochOfVoter( this.state, epoch, currentProcess );

    if ( this._allLocksReceived() ) {
        //timeout has served it's duty, we got all votes
        clearTimeout( this.state.timeout );

        if ( this._coordinatorHasNewestEpoch( this.state, this.epoch ) ) {
            if ( this._noDeniedLocks() ) {
                //in the case that the coordinator has the newest epoch, and no negative
                //votes were received, coordinator can now update it's replicas
                this._updateItsReplicas();
            } else {
                //we got negative votes, abort
                this.process.tunnel.createBatchAndSend( this.state.lockedProcesses, this._getAbortEpochChangeMsg() );
                //If it was a read, we can try to ignore the failed processes and
                //try again to find a read quorum
                if ( this.currentBaseOperation.type === 'read' ) {
                    this.currentBaseOperation();
                } else if ( this.currentBaseOperation.type === 'write' ) {
                    //same for the write
                    this.currentBaseOperation();
                } else {
                    //otherwise this was started by a registration process and we have to send back an error
                    //that the registration was not successful.  
                    var newProcess = this.forceInclude[this.forceInclude.length - 1];
                    var json = {
                        action: 'notAdded'
                    };
                    this.process.tunnel.send( json, newProcess.address, newProcess.port );
                }

            }
        } else {
            // if the current coordinator has not the newest epoch,
            // it aborts the write,
            this.process.tunnel.createBatchAndSend( this.state.lockedProcesses, this._getAbortEpochChangeMsg() );
            // and requests an update from the newest process.  The completed Update
            // will trigger the current base operation. The current epoch change will be 
            // discarded, as the new epoch may already have the changes
            this._updateMeTo( this.state.upToDateProcess );
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
Coordination.prototype._collectVotes = function ( positive, currentProcess, keyVersion ) {
    if ( positive ) {
        this.state.keyVersions[currentProcess.id] = keyVersion;
        this.state.receivedLocks++;
        this.state.lockedProcesses.push( currentProcess );
    } else {
        this.state.deniedLocks++;
        this.busy.push( currentProcess );
    }
};


/**
 * ##_allLocksReceived
 *
 * @return {boolean}
 */
Coordination.prototype._allLocksReceived = function () {
    return this.state.receivedLocks + this.state.deniedLocks === this.state.quorum.length;
};

/** 
 * ##_noDeniedLocks
 * Does _not_ check, if all votes already came in!
 * 
 * @return {boolean}
 */
Coordination.prototype._noDeniedLocks = function () {
    return this.state.deniedLocks === 0;
};


/**
 * ##_updateItsReplicas
 * is the function to determine outdated key-value pairs and update them  
 * intermediate step between voting and preparing to commit stages of 3PC
 */
Coordination.prototype._updateItsReplicas = function () {
    this.process.logger.verbose( 'Update the Replicas' );
    // the maximal version number for every key (plus the owning process) is computed ...
    var keyVersionMax = this._updateItsReplicas._computeKeyMaxVersion( this.state.keyVersions );
    // ... and compared against the local replicas
    var resObj = this._determineOutdatedKeys( keyVersionMax );

    var outdatedReplicas = resObj.outdated;
    var necessary = resObj.necessary;

    //updating the state
    this.state = {
        name: 'waitForUpdates',
        quorum: this.state.quorum,
        newRoot: this.state.newRoot,
        newProcessList: this.state.newProcessList,
        keyVersions: this.state.keyVersions,
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
Coordination.prototype._updateItsReplicas._computeKeyMaxVersion = function ( keyVersions ) {
    var result = {};
    for ( var id in keyVersions ) {
        if ( keyVersions.hasOwnProperty( id ) ) {
            for ( var key in keyVersions[id] ) {
                if ( keyVersions[id].hasOwnProperty( key ) &&
                    typeof keyVersions[id][key].version !== 'undefined' ) {
                    if ( !result[key] ) {
                        result[key] = {version: keyVersions[id][key].version,
                            id: id};
                    } else {
                        if ( result[key].version < keyVersions[id][key].version ) {
                            result[key] = {version: keyVersions[id][key].version,
                                id: id};
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
Coordination.prototype._determineOutdatedKeys = function ( keyVersionMax ) {
    var that = this;
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

    /**
     * ###_keyIsOutdated
     *
     * @param {string} key - The key to check
     * @return {boolean}
     */
    function keyIsOutdated ( key ) {
        return (!that.state.keyVersions[that.process.id] || !that.state.keyVersions[that.process.id][key] ||
            keyVersionMax[key].version > that.state.keyVersions[that.process.id][key].version);
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
Coordination.prototype._requestUpdates = function ( outdated ) {
    for ( var key in outdated ) {
        if ( outdated.hasOwnProperty( key ) ) {
            var json = {
                action: 'plainRead',
                data: key,
                port: this.process.port
            };
            var updatedProcess = util.mapIdToProcess( Number(outdated[key].id), this.state.quorum );
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
Coordination.prototype._processPlainRead = function ( key, value, version ) {
    this.process.storage.write( key, value, version );
    this.state.updates++;
    if ( this.state.updates === this.state.necessary ) {
        this._preCommitUpdatesToQuorum();
    }
};


/**
 * ##_preCommitUpdatesToQuorum
 * Creates a unique patch of key, value, version triples for every process in the
 * quorum and pushes them along with the new voting structure.
 *
 */
Coordination.prototype._preCommitUpdatesToQuorum = function () {

    //updating the state
    this.state = {
        name: 'preCommitUpdates',
        quorum: this.state.quorum,
        newRoot: this.state.newRoot,
        newProcessList: this.state.newProcessList,
        keyVersions: this.state.keyVersions,
        keyVersionMax: this.state.keyVersionMax,
        ack: 0
    };
    this.process.logger.debug( 'preCommit, quorum length: ' + this.state.quorum.length );

    //we have to delete the parent edges for the new root to be able to send it.  
    //No adding afterwards needed, as this happens when the new quorum system 
    // is going to be installed
    node.deleteParentEdges( this.state.newRoot );
    //assemble the fitting storage patch for every process in the quorum ...
    var batchMessage = [];
    for ( var i = 0; i < this.state.quorum.length; i++ ) {
        batchMessage.push( this._createMessageForProcess( i ) );
    }

    // timeout for the case, that the acknowledgements for the epoch change are
    // not received in time
    this.state.timeout = setTimeout( function () {
        if ( this.state && this.state.name === 'preCommitUpdates' ) {
            this.process.logger.warn( 'Commit aborted, timeout reached' );

            this.process.tunnel.createBatchAndSend( this.state.quorum, this._getAbortEpochChangeMsg() );
            this._testProcesses();
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
Coordination.prototype._createMessageForProcess = function ( i ) {
    var currProcess = this.state.quorum[i];
    //compute the outdated keys for process _i_  
    // if i is the current process we don't need to do anything as it just got updated
    var outdated = {};
    if ( currProcess.id !== this.process.id ) {
        outdated = this._getOutdatedKeysForId(
            this.state.keyVersions,
            this.state.keyVersionMax,
            currProcess.id );
    }
    //and create the fitting storagePatch ...
    var storagePatch = this.process.storage.multiRead( outdated );
    var json = {action: 'preCommitEpochData',
        data: {
            epoch: this.process.dataReplicationCoordinator.epoch + 1,
            root: this.state.newRoot,
            storagePatch: storagePatch,
            allProcesses: this.state.newProcessList
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
Coordination.prototype._getOutdatedKeysForId = function ( keyVersions, keyVersionMax, id ) {
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
        return (!keyVersions[id] || !keyVersions[id][key] ||
            keyVersionMax[key].version > keyVersions[id][key].version);
    }

    return result;
};


/**
 * ##_epochAcknowledged
 * finally collects the answers to the epoch change message and continues with the operation
 * 
 */
Coordination.prototype._epochAcknowledged = function () {
    if (this.state.name !== 'preCommitUpdates'){
        return;
    }
    this.state.ack++;
    if ( this.state.ack === this.state.quorum.length ) {
        clearTimeout( this.state.timeout );
        var json = {
            action: 'commitEpochChange',
            port: this.process.port
        };
        this.process.tunnel.createBatchAndSend( this.state.quorum, json );

        this.forceInclude = [];
        if ( this.currentBaseOperation ) {
            this.currentBaseOperation();
        }
    }
};


//#Write methods
/*
 */

/**
 * ##_vote
 * Will be called in direct succeeding to the write method.
 * It's purpose is to send a voting message for the write process
 * to the current quorum.
 */
Coordination.prototype._vote = function () {
    assert( this.state.name === 'beginWrite',
        'Wrong state, expected "beginWrite" but got ' + this.state.name );

    this.process.logger.verbose( 'voting ' + util.extractIds( this.state.quorum ) );

    //updating the state
    this.state = {name: 'waitForVotes',
        key: this.state.key,
        value: this.state.value,
        attempt: this.state.attempt,
        useResult: this.state.useResult,
        quorum: this.state.quorum,
        outdatedMembers: [],
        receivedPositiveVotes: 0,
        receivedNegativeVotes: 0,
        positiveVoters: [],
        maxVersion: -1,
        upToDateProcess: this.process.getMeAsJson()};
    this.state.upToDateProcess.epoch = this.epoch;

    //that timeout covers the case that some processes won't answer to the voting request
    this.state.timeout = setTimeout( function () {
        this.process.logger.verbose( 'Cancelling....' );
        if ( this.state && this.state.name === 'waitForVotes' ) {
            this.process.tunnel.createBatchAndSend( this.state.quorum, this._getAbortWriteMsg() );
            this.process.logger.warn( 'voting aborted, timeout reached: vote for write' );
            //test if we encountered some newer epochs, first update that process before
            //testing all
            if ( this._coordinatorHasNewestEpoch( this.state, this.epoch ) ) {
                this.state.name = 'idle';
                this._testProcesses();
            } else {
                this._updateMeTo( this.state.upToDateProcess );
            }
        }
    }.bind( this ), this.options.coordination.write.vote.timeout );

    var json = {action: 'voteForWrite',
        data: this.state.key,
        port: this.process.port};
    //send the voting request to the quorum
    this.process.tunnel.createBatchAndSend( this.state.quorum, json );
};


/**
 * ##_processVote
 * collects all votes
 *
 * @param {boolean} positiveVote - a boolean whether or not the vote is positive
 * @param {object} data - a json object, containing  
 *  `process:` the process whose vote triggered this call  
 *  `epoch:` the epoch of the coordinator of said process
 */
Coordination.prototype._processVote = function ( positiveVote, data ) {
    var currentProcess = data.process;
    var epoch = data.epoch;

    //process the incoming vote,  
    //a negative voting process will be added to the busy list,
    //a positive voter's version will be checked and the most recent version is accumulated  
    //  **-> alters the state**
    this._processVote._accumulateAnswer( this.state, this.busy, positiveVote, data.version, currentProcess );
    //check if voter has a newer Epoch  
    // **-> alters the state**
    this._checkEpochOfVoter( this.state, epoch, currentProcess );

    if ( this._processVote._allVotesReceived( this.state ) ) {
        //timeout has served it's duty, we got all votes
        clearTimeout( this.state.timeout );

        if ( this._coordinatorHasNewestEpoch( this.state, this.epoch ) ) {
            this._updateOutdatedMembers();
            if ( this._processVote._noNegativeVotesReceived( this.state ) ) {
                //in the case that the coordinator has the newest epoch, and no negative
                //votes were received, the commit can be prepared
                this._prepareCommit();
            } else {
                //if there were some negative votes, we have to abort
                this.process.tunnel.createBatchAndSend( this.state.positiveVoters, this._getAbortWriteMsg() );
                //and because of the intersection property of the quorums, we have no chance
                //of getting a quorum
                var copyBusy = [].concat( this.busy );
                var useResult = this.state.useResult;
                this._resetCoordinator();
                useResult( {
                    error: 'could not establish quorum because too many processes are busy',
                    busy: copyBusy
                } );
            }
        } else {
            // if the current coordinator has not the newest epoch,
            // it aborts the write
            this.process.tunnel.createBatchAndSend( this.state.quorum, this._getAbortWriteMsg() );
            // and requests an update from the newest process.  The completed Update
            // will trigger the current base operation to re-perform the write.
            this._updateMeTo( this.state.upToDateProcess );
        }
    }
};


/**
 * ##_prepareCommit
 * Will be called if all votes were positive and the coordinator
 * has the newest epoch. It implements the beginning of part 2 of 3PC
 */
Coordination.prototype._prepareCommit = function () {
    assert( this.state.name === 'waitForVotes',
        'Wrong state, expected "waitForVotes" but got ' + this.state.name );

    this.process.logger.verbose( 'preparing commit' );

    //updating the state
    this.state = {name: 'waitForACK',
        key: this.state.key,
        value: this.state.value,
        attempt: this.state.attempt,
        useResult: this.state.useResult,
        quorum: this.state.quorum,
        maxVersion: this.state.maxVersion,
        receivedACK: 0
    };

    // timeout for the case, that the acknowledgements for the commit are
    // not received in time
    this.state.timeout = setTimeout( function () {
        if ( this.state && this.state.name === 'prepareCommit' ) {
            this.process.logger.warn( 'Commit aborted, timeout reached' );
            // here we already have the newest epoch, this has to be a recent failure
            this.process.tunnel.createBatchAndSend( this.state.quorum, this._getAbortCommitMsg() );
            this._testProcesses();
        }
    }.bind( this ), this.options.coordination.write.voteForWrite.timeout );

    //preparation of the new data
    var nextVersion = this.state.maxVersion + 1;
    var json = {action: 'prepareCommit',
        data: {key: this.state.key,
            value: this.state.value,
            version: nextVersion},
        port: this.process.port};

    //send the prepare message to the quorum.  
    //at this point, all quorum processes have a write lock for this operation
    this.process.tunnel.createBatchAndSend( this.state.quorum, json );
};


/**
 * ##_voteForWrite
 * processes an incoming acknowledgement for the pending commit
 */
Coordination.prototype._voteForWrite = function () {
    //###_allAcknowledged
    var allAcknowledged = function () {
        return this.state.receivedACK === this.state.quorum.length;
    }.bind(this);

    //###_sendCommitMessage
    var sendCommitMessage = function () {
        var json = {action: 'commit',
            data: this.state.key,
            port: this.process.port
        };
        this.process.tunnel.createBatchAndSend( this.state.quorum, json );
    }.bind(this);

    this.state.receivedACK++;
    if ( allAcknowledged() ) {
        //when all acknowledgements are received, the timeout can be cleared
        clearTimeout( this.state.timeout );
        this.process.logger.verbose( 'committing' );
        //and the commit can be finalized
        sendCommitMessage();

        this.state.receivedCommits = 0;
        this.state.cleanup = function () {
                clearTimeout( this.state.commitTimeout );

                //cleanup, reset state to idle
                var useResult = this.state.useResult;
                var key = this.state.key;
                var value = this.state.value;
                var quorum = this.state.quorum;
                this._resetCoordinator();
                
                //call the original useResult function
                useResult( null, {
                    key: key,
                    value: value,
                    quorum: quorum
                } );
            }.bind( this );
        this.state.commitTimeout = setTimeout(
            this.state.cleanup, 
            this.options.coordination.write.waitForCommit.timeout );
    }
};

/**
 * ##processCommit
 * collects commit messages and invokes the read callback function
 */
Coordination.prototype.processCommit = function () {
    //###_allAcknowledged
    var allAcknowledged = function  () {
        return this.state.receivedCommits === this.state.quorum.length;
    }.bind( this );

    this.state.receivedCommits++;
    if ( allAcknowledged() ) {
        if ( this.state.commitTimeout ) {
            clearTimeout( this.state.commitTimeout );
            this.state.cleanup();
        }
    }
};



/**
 * ##_accumulateAnswer
 * processes the received answer:  
 *  updates the counters and adds the answering process to the available respectively busy list
 * if the vote was positive, the information about the maximal version of the replica value will be updated
 * 
 * @param {object} state - state of the calling process
 * @param {Process[]} busy - list of busy processes
 * @param {boolean} positiveVote - boolean whether the vote got a lock or not
 * @param {number} version - version of the data for the key the vote was for
 * @param {Process} currentProcess - the process that casted the vote
 */
Coordination.prototype._processVote._accumulateAnswer = function ( state, busy, positiveVote, version, currentProcess ) {
    if ( positiveVote ) {
        state.maxVersion = state.maxVersion < version ?
            version : state.maxVersion;

        state.receivedPositiveVotes++;
        state.positiveVoters.push( currentProcess );
    } else {
        state.receivedNegativeVotes++;
        busy.push( currentProcess );
    }
};


/**
 * ##_allVotesReceived
 *
 * @param {object} state - state of the calling process
 * @return {boolean}
 */
Coordination.prototype._processVote._allVotesReceived = function ( state ) {
    return state.receivedPositiveVotes + state.receivedNegativeVotes === state.quorum.length;
};


/**
 * ##_noNegativeVotesReceived
 * Does _not_ check, if all votes already came in!
 * 
 * @param {object} state - state of the calling process
 * @return {boolean}
 */
Coordination.prototype._processVote._noNegativeVotesReceived = function ( state ) {
    return state.receivedNegativeVotes === 0;
};


/**
 * ##_performRead
 * will be called if all locks were acquired and the coordinator
 * has the newest epoch.
 */
Coordination.prototype._performRead = function () {
    //updating the state
    this.state = {
        name: 'waitForReads',
        key: this.state.key,
        useResult: this.state.useResult,
        quorum: this.state.quorum,
        receivedReads: 0,
        currentVersion: -1,
        value: null
    };

    // set the timeout for the read operation
    this.state.timeout = setTimeout( function () {
        if ( this.state && this.state.name === 'waitForReads' ) {
            this.process.logger.warn( 'reading aborted, timeout reached' );
            // here we already have the newest epoch, this has to be a recent failure
            this.process.tunnel.createBatchAndSend( this.state.quorum, this._getAbortReadMsg() );
            this._testProcesses();
        }
    }.bind( this ), this.options.coordination.read.read.timeout );

    // send the read request to the quorum
    var json = {action: 'read',
        data: this.state.key,
        port: this.process.port};
    this.process.tunnel.createBatchAndSend( this.state.quorum, json );
};


//#Read methods
/*
 */

/**
 * ##_lock
 * will be called in direct succeeding to the read method.
 * It's purpose is to lock the quorum for for the read process
 */
Coordination.prototype._lock = function () {
    assert( this.state.name === 'beginRead',
        'Wrong state, expected "beginRead" but got ' + this.state.name );

    //updating the state
    this.state = {name: 'waitForLocks',
        key: this.state.key,
        useResult: this.state.useResult,
        quorum: this.state.quorum,
        outdatedMembers: [],
        receivedLocks: 0,
        receivedNotLocked: 0,
        locked: [],
        upToDateProcess: this.process.getMeAsJson()};
    this.state.upToDateProcess.epoch = this.epoch;

    this.process.logger.verbose( 'locking ' + util.extractIds( this.state.quorum ) );


    //this timeout covers the case that some processes won't answer to the locking request
    this.state.timeout = setTimeout( function () {
        if ( this.state && this.state.name === 'waitForLocks' ) {
            this.process.logger.warn( 'voting aborted, timeout reached: wait for locks' );
            this.process.tunnel.createBatchAndSend( this.state.quorum, this._getAbortReadMsg() );
            //test if we encountered some newer epochs, first update this process before
            //testing all
            if ( this._coordinatorHasNewestEpoch( this.state, this.epoch ) ) {
                this.state.name = 'idle';
                this._testProcesses();
            } else {
                this._updateMeTo( this.state.upToDateProcess );
            }
        }
    }.bind( this ), this.options.coordination.read.lock.timeout );

    var json = {action: 'lockForRead',
        data: this.state.key,
        port: this.process.port};
    //send the lock request to the quorum
    this.process.tunnel.createBatchAndSend( this.state.quorum, json );
};


/**
 * ##_processReadLock
 * collects the incoming read locks
 *
 * @param {boolean} positive - a boolean whether or not the coordinator got the lock
 * @param {object} data - a json object, containing
 *  `process:` the process whose vote triggered this call
 *  `epoch:` the epoch of the coordinator of said process
 */
Coordination.prototype._processReadLock = function ( positive, data ) {
    var currentProcess = data.process;
    var epoch = data.epoch;

    //process the answer,  
    //  **-> alters the state**  
    //
    //a negative answer causes the process to be added to the busy list,  
    //a positive answer causes the process to be added to the list of locked processes
    this._processReadLock_accumulateAnswer( positive, currentProcess );

    //check if voter has a newer Epoch and save the most recent process  
    // **-> alters the state**
    this._checkEpochOfVoter( this.state, epoch, currentProcess );

    if ( this._allAnswersReceived() ) {
        //timeout has served it's duty, we got all answers in time
        clearTimeout( this.state.timeout );


        if ( this._coordinatorHasNewestEpoch( this.state, this.epoch ) ) {
            this._updateOutdatedMembers();
            if ( this._noLocksRefused() ) {
                //in the case that the coordinator has the newest epoch, and no                     
                // locks were refused, the read can be executed
                this._performRead();
            } else {
                //if there were some refused locks, we have to abort
                this.process.tunnel.createBatchAndSend( this.state.locked, this._getAbortReadMsg() );
                //and try again with the updated busy process list
                this.currentBaseOperation();
            }
        } else {
            // if the current coordinator has not the newest epoch,
            // it aborts the write
            this.process.tunnel.createBatchAndSend( this.state.quorum, this._getAbortReadMsg() );
            // and requests an update from the newest process.  The completed Update
            // will trigger the current base operation to re-perform the write.
            this._updateMeTo( this.state.upToDateProcess );
        }
    }
};


/**
 * ##_accumulateAnswer
 * processes the received answer:  
 *  updates the counters and adds the answering process to the available respectively busy list
 * 
 * @param {boolean} positiveVote - boolean whether the read lock got a positive answer or not
 * @param {Process} currentProcess - the process that casted the vote
 */
Coordination.prototype._processReadLock_accumulateAnswer = function ( positiveVote, currentProcess ) {
    if ( positiveVote ) {
        this.state.receivedLocks++;
        this.state.locked.push( currentProcess );
    } else {
        this.state.receivedNotLocked++;
        this.busy.push( currentProcess );
    }
};


/**
 * ##_allAnswersReceived
 *
 * @return {boolean}
 */
Coordination.prototype._allAnswersReceived = function () {
    return this.state.receivedLocks + this.state.receivedNotLocked === this.state.quorum.length;
};

/**
 * ##_noLocksRefused
 * does _not_ check, if all locks already came in!
 *
 * @return {boolean}
 */
Coordination.prototype._noLocksRefused = function () {
    return this.state.receivedNotLocked === 0;
};


/**
 * ##_processRead
 * processes an incoming read message  
 * the parameters are
 * 
 * @param {string} key - the key for the read operation
 * @param {any} value - the read value
 * @param {number} version - version of the value
 */
Coordination.prototype._processRead = function ( key, value, version ) {
    assert( key === this.state.key,
        'received key ' + key + ' does not match the current read operation' +
            ' for key ' + this.state.key );

    this.state.receivedReads++;

    // checks if the version of this returned read value is higher
    // and updates the saved value with maximal version  
    // **-> alters the state**
    this._updateSavedValue( value, version );

    if ( this._allReadsReturned() ) {
        //timeout has served it's duty, we got all answers in time
        clearTimeout( this.state.timeout );

        //temporary save the result,
        var res = this.state.value;
        //the function to be called with the result
        var useResult = this.state.useResult;
        var quorum = this.state.quorum;
        //and reset the coordinator
        this._resetCoordinator();
        this.process.logger.debug( 'read ' + res );

        //finally the value is returned
        useResult( null, {
            key: key,
            value: res, 
            quorum: quorum
        } );
    }
};


/**
 * ##_allReadsReturned
 * Checks if all reads have returned.
 *
 * @return {boolean}
 */
Coordination.prototype._allReadsReturned = function () {
    return this.state.receivedReads === this.state.quorum.length;
};


/**
 * ##_updateSavedValue
 * 
 * @param {any} value - value that was read
 * @param {number} version - version of the read value
 */
Coordination.prototype._updateSavedValue = function ( value, version ) {
    if ( this.state.currentVersion < version ) {
        this.state.value = value;
        this.state.currentVersion = version;
        this.process.logger.debug( 'Saved: ' + value + ' with version ' + version );
    }
};


//#Miscellaneous
/*
 */


/**
 * ##_coordinatorHasNewestEpoch
 * compares the current state's upToDateProcesses epoch with the coordinators epoch  
 *  __needs appropriate state__ 
 * 
 * @param {object} state - current state of the coordinator
 * @param {number} epoch - epoch of the coordinator
 * @return {boolean}
 */
Coordination.prototype._coordinatorHasNewestEpoch = function ( state, epoch ) {
    return state.upToDateProcess.epoch === epoch;
};


/**
 * ##_checkEpochOfVoter
 * compares the epoch of the answering process with the currently latest  
 * if the currently examined process has a newer epoch, this process and it's epoch number
 * is saved  
 *  __needs appropriate state and alters it__
 * 
 * @param {object} state - current state of the coordinator
 * @param {number} epoch - epoch of the coordinator
 * @param {Process} currentProcess - process to be compared against
 */
Coordination.prototype._checkEpochOfVoter = function ( state, epoch, currentProcess ) {
    if ( state.upToDateProcess.epoch < epoch ) {
        state.upToDateProcess = currentProcess;
        state.upToDateProcess.epoch = epoch;
    } else if ( state.upToDateProcess.epoch > epoch ) {
        state.outdatedMembers.push( currentProcess );
    }
};


/**
 * ##_updateOutdatedMembers
 * sends the current epoch data to the outdated members
 *  __needs appropriate state__
 */
Coordination.prototype._updateOutdatedMembers = function () {
    var json = {
        action: 'aNewerEpoch',
        data: {
            root: deleteParentEdges( this.root ),
            epoch: this.epoch,
            allProcesses: this.process.allProcesses
        },
        port: this.process.port
    };
    this.process.tunnel.createBatchAndSend( this.state.outdatedMembers, json );
    addParentEdges( this.root );
};


/**
 * ##_updateMeTo
 * Sends a request to a more recent process to send his
 * voting structure, epoch number and list of processes.
 * 
 * @param {Process} upToDateProcess - process to ask for the update
 */
Coordination.prototype._updateMeTo = function ( upToDateProcess ) {
    this.process.tunnel.send( {
            action: 'updateMe',
            port: this.process.port
        },
        upToDateProcess.address,
        upToDateProcess.port );
};


/**
 * ##_resetCoordinator
 * This is a helper function to reset the coordinator's state.
 */
Coordination.prototype._resetCoordinator = function () {
    var that = this;

    this.state = {name: 'idle'};
    this.busy = [];
    this.currentBaseOperation = function () {
        that.state = {name: 'idle'};
    };
    this.currentBaseOperation.name = 'idle';
};


/**
 * ##_testProcesses
 * 
 * Cycles through all processes and tests the connection. If no connection can be established, the process
 * is deleted and an epoch change is kicked of.
 */
Coordination.prototype._testProcesses = function () {

    this.process.logger.verbose( 'testing Processes' );
    var nA = [];
    var online = 0;
    var offline = 0;
    var needed = this.process.allProcesses.length - 1;

    /**
     * ###_testProcess
     * Tests the connection of supplied process. When no connection can be established, it's going
     * to be added to an ignore list. After all processes are tested, an epoch change
     * is started when necessary
     *
     * @param {Process} processToTest - process to be tested
     */
    var testProcess = function ( processToTest ) {
        /**
         * ####_processOnline
         * function to be called when a connection could be established.  
         * Just raises the counter for online processes and checks if all processes were tested
         */
        var processOnline = function () {
            this.process.logger.debug( 'Process ' + processToTest.id + ' is online' );
            online++;
            //can only be true when every process is online. Hence no epoch change is necessary and
            //we can proceed with the normal operations
            if ( online === needed ) {
                this.currentBaseOperation();
            } else if ( online + offline === needed ) {
                //otherwise proceed when all processes are tested
                this.process.logger.verbose( 'Changing Epoch' );
                this._changeEpoch( nA );
            }
        }.bind( this );

        /**
         * ####_processFailure
         * function to be called when a connection could _not_ be established.  
         * Raises the counter for offline processes and checks if all processes were tested
         */
        var processFailure = function () {
            this.process.logger.warn( 'Process ' + processToTest.id + ' is offline' );
            offline++;
            //Add it to the list of ignored processes
            nA.push( processToTest );
            //and proceed when all processes are tested
            if ( online + offline === needed ) {
                this.process.logger.verbose( 'Changing Epoch' );
                this._changeEpoch( nA );
            }
        }.bind( this );

        if ( processToTest && processToTest.id !== undefined && processToTest.id !== this.process.id ) {
            this.process.tunnel.connectionTest( processToTest, processOnline, processFailure );
        }
    }.bind( this );

    this.process.allProcesses.forEach( function ( process ) {
        testProcess( process );
    } );
};


module.exports = Coordination;
