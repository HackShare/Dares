/**
 *
 * writeCoordination.js
 * ====================
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements the write operation.
 *
 */

'use strict';

var assert = require( 'assert' );
var util = require( '../utility.js' );

var WriteCoordination = function ( coordination, p ) {
    this.coordination = coordination;
    this.process = p;
    this.options = coordination.options;
};


/**
 * ##_vote
 * Will be called in direct succeeding to the write method.
 * It's purpose is to send a voting message for the write process
 * to the current quorum.
 */
WriteCoordination.prototype._vote = function () {
    assert( this.coordination.state.name === 'beginWrite',
        'Wrong state, expected "beginWrite" but got ' + this.coordination.state.name );

    this.process.logger.verbose( 'voting ' + util.extractIds( this.coordination.state.quorum ) );

    //updating the state
    this.coordination.state = {
        name: 'waitForVotes',
        key: this.coordination.state.key,
        value: this.coordination.state.value,
        attempt: this.coordination.state.attempt,
        useResult: this.coordination.state.useResult,
        quorum: this.coordination.state.quorum,
        outdatedMembers: [],
        receivedPositiveVotes: 0,
        receivedNegativeVotes: 0,
        positiveVoters: [],
        maxVersion: -1,
        upToDateProcess: this.process.getMeAsJson()
    };
    this.coordination.state.upToDateProcess.epoch = this.coordination.epoch;

    //that timeout covers the case that some processes won't answer to the voting request
    this.coordination.state.timeout = setTimeout( function () {
        this.process.logger.verbose( 'Cancelling....' );
        if ( this.coordination.state && this.coordination.state.name === 'waitForVotes' ) {
            this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, this.coordination._getAbortWriteMsg() );
            this.process.logger.warn( 'voting aborted, timeout reached: vote for write' );
            //test if we encountered some newer epochs, first update that process before
            //testing all
            if ( this.coordination._coordinatorHasNewestEpoch( this.coordination.state, this.coordination.epoch ) ) {
                this.coordination.state.name = 'idle';
                this.coordination._testProcesses();
            } else {
                this.coordination._updateMeTo( this.coordination.state.upToDateProcess );
            }
        }
    }.bind( this ), this.options.coordination.write.vote.timeout );

    var json = {
        action: 'voteForWrite',
        data: this.coordination.state.key,
        port: this.process.port
    };
    //send the voting request to the quorum
    this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, json );
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
WriteCoordination.prototype._processVote = function ( positiveVote, data ) {
    var currentProcess = data.process;
    var epoch = data.epoch;

    //process the incoming vote,  
    //a negative voting process will be added to the busy list,
    //a positive voter's version will be checked and the most recent version is accumulated  
    //  **-> alters the state**
    this._processVote._accumulateAnswer( this.coordination.state, this.coordination.busy, positiveVote, data.version, currentProcess );
    //check if voter has a newer Epoch  
    // **-> alters the state**
    this.coordination._checkEpochOfVoter( this.coordination.state, epoch, currentProcess );

    if ( this._processVote._allVotesReceived( this.coordination.state ) ) {
        //timeout has served it's duty, we got all votes
        clearTimeout( this.coordination.state.timeout );

        if ( this.coordination._coordinatorHasNewestEpoch( this.coordination.state, this.coordination.epoch ) ) {
            this.coordination._updateOutdatedMembers();
            if ( this._processVote._noNegativeVotesReceived( this.coordination.state ) ) {
                //in the case that the coordinator has the newest epoch, and no negative
                //votes were received, the commit can be prepared
                this._prepareCommit();
            } else {
                //if there were some negative votes, we have to abort
                this.process.tunnel.createBatchAndSend( this.coordination.state.positiveVoters, this.coordination._getAbortWriteMsg() );
                //and because of the intersection property of the quorums, we have no chance
                //of getting a quorum
                var copyBusy = [].concat( this.coordination.busy );
                var useResult = this.coordination.state.useResult;
                this.coordination._resetCoordinator();
                useResult( {
                    error: 'could not establish quorum because too many processes are busy',
                    busy: copyBusy
                } );
            }
        } else {
            // if the current coordinator has not the newest epoch,
            // it aborts the write
            this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, this.coordination._getAbortWriteMsg() );
            // and requests an update from the newest process.  The completed Update
            // will trigger the current base operation to re-perform the write.
            this.coordination._updateMeTo( this.coordination.state.upToDateProcess );
        }
    }
};


/**
 * ##_prepareCommit
 * Will be called if all votes were positive and the coordinator
 * has the newest epoch. It implements the beginning of part 2 of 3PC
 */
WriteCoordination.prototype._prepareCommit = function () {
    assert( this.coordination.state.name === 'waitForVotes',
        'Wrong state, expected "waitForVotes" but got ' + this.coordination.state.name );

    this.process.logger.verbose( 'preparing commit' );

    //updating the state
    this.coordination.state = {
        name: 'waitForACK',
        key: this.coordination.state.key,
        value: this.coordination.state.value,
        attempt: this.coordination.state.attempt,
        useResult: this.coordination.state.useResult,
        quorum: this.coordination.state.quorum,
        maxVersion: this.coordination.state.maxVersion,
        receivedACK: 0
    };

    // timeout for the case, that the acknowledgements for the commit are
    // not received in time
    this.coordination.state.timeout = setTimeout( function () {
        if ( this.coordination.state && this.coordination.state.name === 'prepareCommit' ) {
            this.process.logger.warn( 'Commit aborted, timeout reached' );
            // here we already have the newest epoch, this has to be a recent failure
            this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, this._getAbortCommitMsg() );
            this.coordination._testProcesses();
        }
    }.bind( this ), this.options.coordination.write.voteForWrite.timeout );

    //preparation of the new data
    var nextVersion = this.coordination.state.maxVersion + 1;
    var json = {
            action: 'prepareCommit',
            data: {
                key: this.coordination.state.key,
                value: this.coordination.state.value,
                version: nextVersion
            },
            port: this.process.port
        };

    //send the prepare message to the quorum.  
    //at this point, all quorum processes have a write lock for this operation
    this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, json );
};


/**
 * ##_voteForWrite
 * processes an incoming acknowledgement for the pending commit
 */
WriteCoordination.prototype._voteForWrite = function () {
    //###_allAcknowledged
    var allAcknowledged = function () {
        return this.coordination.state.receivedACK === this.coordination.state.quorum.length;
    }.bind( this );

    //###_sendCommitMessage
    var sendCommitMessage = function () {
        var json = {
            action: 'commit',
            data: this.coordination.state.key,
            port: this.process.port
        };
        this.process.tunnel.createBatchAndSend( this.coordination.state.quorum, json );
    }.bind( this );

    this.coordination.state.receivedACK++;
    if ( allAcknowledged() ) {
        //when all acknowledgements are received, the timeout can be cleared
        clearTimeout( this.coordination.state.timeout );
        this.process.logger.verbose( 'committing' );
        //and the commit can be finalized
        sendCommitMessage();

        this.coordination.state.receivedCommits = 0;
        this.coordination.state.cleanup = function () {
            clearTimeout( this.coordination.state.commitTimeout );

            //cleanup, reset state to idle
            var useResult = this.coordination.state.useResult;
            var key = this.coordination.state.key;
            var value = this.coordination.state.value;
            var quorum = this.coordination.state.quorum;
            this.coordination._resetCoordinator();
            
            //call the original useResult function
            useResult( null, {
                key: key,
                value: value,
                quorum: quorum
            } );
        }.bind( this );
        this.coordination.state.commitTimeout = setTimeout(
            this.coordination.state.cleanup, 
            this.options.coordination.write.waitForCommit.timeout );
    }
};

/**
 * ##processCommit
 * collects commit messages and invokes the read callback function
 */
WriteCoordination.prototype.processCommit = function () {
    //###_allAcknowledged
    var allAcknowledged = function  () {
        return this.coordination.state.receivedCommits === this.coordination.state.quorum.length;
    }.bind( this );

    this.coordination.state.receivedCommits++;
    if ( allAcknowledged() ) {
        if ( this.coordination.state.commitTimeout ) {
            clearTimeout( this.coordination.state.commitTimeout );
            this.coordination.state.cleanup();
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
WriteCoordination.prototype._processVote._accumulateAnswer = function ( state, busy, positiveVote, version, currentProcess ) {
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
WriteCoordination.prototype._processVote._allVotesReceived = function ( state ) {
    return state.receivedPositiveVotes + state.receivedNegativeVotes === state.quorum.length;
};


/**
 * ##_noNegativeVotesReceived
 * Does _not_ check, if all votes already came in!
 * 
 * @param {object} state - state of the calling process
 * @return {boolean}
 */
WriteCoordination.prototype._processVote._noNegativeVotesReceived = function ( state ) {
    return state.receivedNegativeVotes === 0;
};

module.exports = WriteCoordination;
