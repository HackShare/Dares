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
var quorum = require( './logic/quorum.js' );
var node = require( './logic/node.js' );
var util = require( './utility.js' );
var addParentEdges = require( './logic/node.js' ).addParentEdges;
var deleteParentEdges = require( './logic/node.js' ).deleteParentEdges;
var ReadCoordination = require( './coordinators/readCoordination.js' );
var WriteCoordination = require( './coordinators/writeCoordination.js' );
var EpochChangeCoordination = require( './coordinators/epochChangeCoordination.js' );

var Coordination = function ( p ) {
    this.process = p;
    this.options = p.options;

    //initializing the base operation. This function is later set to
    //the current read or write Operation  
    this.currentBaseOperation = function () {
        this.state = {name: 'idle'};
    }.bind( this );
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

    this.readCoordination = new ReadCoordination( this, p );
    this.writeCoordination = new WriteCoordination( this, p );
    this.epochChangeCoordination = new EpochChangeCoordination( this, p );
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
                this.write( key, value, useResult );
            }.bind( this ),
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
            this.writeCoordination._vote();
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
                this.read( key, useResult );
            }.bind( this ),
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
            this.readCoordination._lock();
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
    /**
     * ###_setEpochChangeRepeatOperation
     * retries the current epoch change, attempts are currently without use
     */
    var setEpochChangeRepeatOperation = function () {

        var saveEpochChangeAttempt;
        if ( this.state && this.state.retryEpochChange ) {
            saveEpochChangeAttempt = this.state.retryEpochChange.attempt + 1;
        } else {
            saveEpochChangeAttempt = 1;
        }

        /**
         * ####_retryOperation
         */
        var retryOperation = function () {
            this._changeEpoch( ignoreTheseProcesses );
        }.bind( this );
        retryOperation.attempt = saveEpochChangeAttempt;
        return retryOperation;
    }.bind( this );

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
        this.epochChangeCoordination._voteForEpochChange();

    }
};


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
    this.state = {name: 'idle'};
    this.busy = [];
    this.currentBaseOperation = function () {
        this.state = {name: 'idle'};
    }.bind( this );
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
