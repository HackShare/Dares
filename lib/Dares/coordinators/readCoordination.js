/**
 *
 * readCoordination.js
 * ===================
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements the read operation.
 *
 */

'use strict';

var util = require( '../utility.js' );

var ReadCoordination = function ( coordination, p ) {
    this.coordination = coordination;
    this.process = p;
    this.options = coordination.options;
};


/**
 * ##_lock
 * will be called in direct succeeding to the read method.
 * It's purpose is to lock the quorum for for the read process
 */
ReadCoordination.prototype._lock = function () {
    if ( this.coordination.state.name !== 'beginRead' ) {
        throw new Error( 'Wrong state, expected "beginRead" but got ' + this.coordination.state.name );
    }

    //updating the state
    this.coordination.state = {
        name: 'waitForLocks',
        key: this.coordination.state.key,
        useResult: this.coordination.state.useResult,
        quorum: this.coordination.state.quorum,
        outdatedMembers: [],
        receivedLocks: 0,
        receivedNotLocked: 0,
        locked: [],
        upToDateProcess: this.process.getMeAsJson()
    };
    this.coordination.state.upToDateProcess.epoch = this.coordination.epoch;

    this.process.logger.verbose( 'locking ' + util.extractIds( this.coordination.state.quorum ) );


    //this timeout covers the case that some processes won't answer to the locking request
    this.coordination.state.timeout = setTimeout( function () {
        if ( this.coordination.state && this.coordination.state.name === 'waitForLocks' ) {
            this.process.logger.warn( 'voting aborted, timeout reached: wait for locks' );
            this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, this.coordination._getAbortReadMsg() );
            //test if we encountered some newer epochs, first update this process before
            //testing all
            if ( this.coordination._coordinatorHasNewestEpoch( this.coordination.state, this.coordination.epoch ) ) {
                this.coordination.state.name = 'idle';
                this.coordination._testProcesses();
            } else {
                this.coordination._updateMeTo( this.coordination.state.upToDateProcess );
            }
        }
    }.bind( this ), this.options.coordination.read.lock.timeout );

    var json = {
        action: 'lockForRead',
        data: this.coordination.state.key,
        port: this.process.port
    };
    //send the lock request to the quorum
    this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, json );
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
ReadCoordination.prototype._processReadLock = function ( positive, data ) {
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
    this.coordination._checkEpochOfVoter( this.coordination.state, epoch, currentProcess );

    if ( this._allAnswersReceived() ) {
        //timeout has served it's duty, we got all answers in time
        clearTimeout( this.coordination.state.timeout );


        if ( this.coordination._coordinatorHasNewestEpoch( this.coordination.state, this.coordination.epoch ) ) {
            this.coordination._updateOutdatedMembers();
            if ( this._noLocksRefused() ) {
                //in the case that the coordinator has the newest epoch, and no                     
                // locks were refused, the read can be executed
                this._performRead();
            } else {
                //if there were some refused locks, we have to abort
                this.process.tunnel.createBatchAndSend( this.coordination.state.locked, this.coordination._getAbortReadMsg() );
                //and try again with the updated busy process list
                this.currentBaseOperation();
            }
        } else {
            // if the current coordinator has not the newest epoch,
            // it aborts the write
            this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, this.coordination._getAbortReadMsg() );
            // and requests an update from the newest process. The completed update
            // will trigger the current base operation to re-perform the read.
            this.coordination._updateMeTo( this.coordination.state.upToDateProcess );
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
ReadCoordination.prototype._processReadLock_accumulateAnswer = function ( positiveVote, currentProcess ) {
    if ( positiveVote ) {
        this.coordination.state.receivedLocks++;
        this.coordination.state.locked.push( currentProcess );
    } else {
        this.coordination.state.receivedNotLocked++;
        this.coordination.busy.push( currentProcess );
    }
};


/**
 * ##_allAnswersReceived
 *
 * @return {boolean}
 */
ReadCoordination.prototype._allAnswersReceived = function () {
    return this.coordination.state.receivedLocks + this.coordination.state.receivedNotLocked === this.coordination.state.quorum.length;
};

/**
 * ##_noLocksRefused
 * does _not_ check, if all locks already came in!
 *
 * @return {boolean}
 */
ReadCoordination.prototype._noLocksRefused = function () {
    return this.coordination.state.receivedNotLocked === 0;
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
ReadCoordination.prototype._processRead = function ( key, value, version ) {
    if ( key !== this.coordination.state.key ) {
        throw new Error( 'received key ' + key + ' does not match the current read operation' +
            ' for key ' + this.coordination.state.key );
    }

    this.coordination.state.receivedReads++;

    // checks if the version of this returned read value is higher
    // and updates the saved value with maximal version  
    // **-> alters the state**
    this._updateSavedValue( value, version );

    if ( this._allReadsReturned() ) {
        //timeout has served it's duty, we got all answers in time
        clearTimeout( this.coordination.state.timeout );

        //temporary save the result,
        var res = this.coordination.state.value;
        //the function to be called with the result
        var useResult = this.coordination.state.useResult;
        var quorum = this.coordination.state.quorum;
        //and reset the coordinator
        this.coordination._resetCoordinator();
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
ReadCoordination.prototype._allReadsReturned = function () {
    return this.coordination.state.receivedReads === this.coordination.state.quorum.length;
};


/**
 * ##_updateSavedValue
 * 
 * @param {any} value - value that was read
 * @param {number} version - version of the read value
 */
ReadCoordination.prototype._updateSavedValue = function ( value, version ) {
    if ( this.coordination.state.currentVersion < version ) {
        this.coordination.state.value = value;
        this.coordination.state.currentVersion = version;
        this.process.logger.debug( 'Saved: ' + value + ' with version ' + version );
    }
};


/**
 * ##_performRead
 * will be called if all locks were acquired and the coordinator
 * has the newest epoch.
 */
ReadCoordination.prototype._performRead = function () {
    //updating the state
    this.coordination.state = {
        name: 'waitForReads',
        key: this.coordination.state.key,
        useResult: this.coordination.state.useResult,
        quorum: this.coordination.state.quorum,
        receivedReads: 0,
        currentVersion: -1,
        value: null
    };

    // set the timeout for the read operation
    this.coordination.state.timeout = setTimeout( function () {
        if ( this.coordination.state && this.coordination.state.name === 'waitForReads' ) {
            this.process.logger.warn( 'reading aborted, timeout reached' );
            // here we already have the newest epoch, this has to be a recent failure
            this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, this.coordination._getAbortReadMsg() );
            this.coordination._testProcesses();
        }
    }.bind( this ), this.options.coordination.read.read.timeout );

    // send the read request to the quorum
    var json = {
        action: 'read',
        data: this.coordination.state.key,
        port: this.process.port
    };
    this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, json );
};


module.exports = ReadCoordination;
