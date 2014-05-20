/**
 *
 * reactions.js
 * ============
 *
 * © 2014, TNG Technology Consulting GmbH
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements the method to react to internal messages send between processes.
 *
 */

'use strict';

//
var addParentEdges = require( './logic/node.js' ).addParentEdges;
var deleteParentEdges = require( './logic/node.js' ).deleteParentEdges;

//The reaction methods get two parameters passed.
//
// * `input:` a json object, containing
//
//    * `action:` determines which reaction to be called
//
//    * `data:` the actual transmitted data object, varies according to the action. The exact shape is later described for each functions
//
//    * `port:` listening port of the sender
//
// * `address:` ip address of the sender
var Reactions = function ( p ) {

    var owningProcess = p;
    var thatCoordinator = owningProcess.dataReplicationCoordinator;
    var reactions = {};
    var send = owningProcess.tunnel.send.bind( owningProcess.tunnel );
    var options = p.options;

    this.reactTo = function ( input, address ) {
        reactions[ input.action ]( input, address );
    };

    //#EpochChange Reactions
    /*
     */

    //##register
    //`sender`: a new process which wants to register to an existing system  
    //`receiver`: any process of the existing system  
    //`input.data`: json representation of the new process  
    //`effect`: triggers an epoch change which includes the new process in the resulting voting 
    //structure
    reactions.register = function ( input ) {
        var newProcess = input.data;
        thatCoordinator.forceInclude.push( newProcess );
        thatCoordinator._changeEpoch();
    };

    //##notAdded
    //`sender`: process of the existing system  
    //`receiver`: new process which wanted to register  
    //`effect`: notifies the new process that registration was not successful
    reactions.notAdded = function () {
        thatCoordinator.gotAnEpochChange( false,
            {error: 'could temporarily not integrate this process'} );
    };

    //##updateMe
    //`sender:` a process, which detected that his epoch is not the most recent  
    //`receiver:` a process with a more recent epoch than the sender  
    //`input.data`: empty, only `input.port` necessary  
    //`effect:` sends all data needed to update the voting structure. Here, no transmitting
    //of replica data is necessary, as the newer epoch has already been established correctly
    reactions.updateMe = function ( input, address ) {
        send( {
            action: 'updatedEpochData',
            data: {
                root: deleteParentEdges( thatCoordinator.root ),
                epoch: thatCoordinator.epoch,
                allProcesses: owningProcess.allProcesses
            },
            port: owningProcess.port
        }, address, input.port );
        addParentEdges( thatCoordinator.root );
    };

    //##updatedEpochData
    //`sender:` a process with a more recent epoch than the receiver  
    //`receiver:` a process with an outdated epoch  
    //`input.data`: json object, containing 
    //
    // * `epoch:` the new epoch number
    //
    // * `root:` root node with attached voting tree
    //
    // * `allProcesses:` recent list of all processes
    //
    //`effect:` the receiver will install the new voting structure and continue with it's base
    //operation. Used only for active updates  
    reactions.updatedEpochData = function ( input ) {
        var data = input.data;
        thatCoordinator.busy = [];
        thatCoordinator.epoch = data.epoch;
        thatCoordinator.root = addParentEdges( data.root );
        owningProcess.allProcesses = data.allProcesses;
        if ( thatCoordinator.currentBaseOperation.name === 'idle' ) {
            thatCoordinator.state.retryEpochChange();
        } else {
            thatCoordinator.currentBaseOperation();
        }
    };

    //##aNewerEpoch
    //`sender:` a process with a more recent epoch than the receiver  
    //`receiver:` a process with an outdated epoch  
    //`input.data`: json object, containing 
    //
    // * `epoch:` the new epoch number
    //
    // * `root:` root node with attached voting tree
    //
    // * `allProcesses:` recent list of all processes
    //
    //`effect:` the receiver will try to install the new voting structure, as soon as he is idle
    // if it notices the information is outdated, it discards it.
    reactions.aNewerEpoch = function ( input ) {
        var data = input.data;
        recursiveCheck();

        function recursiveCheck () {
            if ( thatCoordinator.epoch < data.epoch ) {
                if ( thatCoordinator.state.name === 'idle' ) {
                    thatCoordinator.epoch = data.epoch;
                    thatCoordinator.root = addParentEdges( data.root );
                    owningProcess.allProcesses = data.allProcesses;
                    owningProcess.logger.info( 'Process ' + owningProcess.id + ' updated to epoch ' + data.epoch );
                } else {
                    setTimeout( recursiveCheck, 100 );
                }
            }
        }
    };


    // ##voteForEpochChange   
    // `sender:` coordinator for an epoch change operation  
    //`receiver:` fusion quorum of the related epoch change  
    //`input.data`: empty, only `input.port` necessary  
    //`effect:` checks if any replicas are locked. If they are, a negative answer is send, otherwise
    // all replicas are locked and the corresponding message is send. Afterwards, a timeout for the expected
    // preCommit message is set.
    reactions.voteForEpochChange = function ( input, address ) {

        if ( !owningProcess.storage.anyOneLocked() ) {
            owningProcess.storage.lockAll();

            send( {action: 'allLocked',
                    data: {
                        epoch: thatCoordinator.epoch,
                        keyVersion: owningProcess.storage.getKeyVersions(),
                        process: owningProcess.getMeAsJson()},
                    port: owningProcess.port},
                address, input.port );

            reactions.voteForEpochChangeControl = {};
            reactions.voteForEpochChangeControl.func = function () {
                owningProcess.storage.unlockAll();
            };

            reactions.voteForEpochChangeControl.timeout = setTimeout(
                reactions.voteForEpochChangeControl.func,
                options.coordination.voting.timeToRollback );

        } else {
            send( {action: 'nothingLocked',
                    data: {
                        process: owningProcess.getMeAsJson(),
                        epoch: thatCoordinator.epoch },
                    port: owningProcess.port},
                address, input.port );
        }
    };

    //##allLocked
    //`sender:` process of a fusion quorum  
    //`receiver:` coordinator for an epoch change operation  
    //`input.data`: json object, containing 
    //
    // * `epoch:` the epoch number of the now locked process
    //
    // * `keyVersion:` a json object, containing all saved keys of the sending process with their values version
    //
    // * `process:` sending process as json
    //
    //`effect:` triggers the vote collecting function positively with the received data
    reactions.allLocked = function ( input ) {
        if ( thatCoordinator.state.name === 'waitForAllLocks' ) {
            var data = input.data;
            thatCoordinator._processAllLock( true, data );
        }
    };

    //##nothingLocked
    //`sender:` process of a fusion quorum  
    //`receiver:` coordinator for an epoch change operation  
    //`input.data`: json object, containing 
    //
    // * `epoch:` the epoch number of the now locked process
    //
    // * `process:` sending process as json
    //
    //`effect:` triggers the vote collecting function negatively with the received data
    reactions.nothingLocked = function ( input ) {
        if ( thatCoordinator.state.name === 'waitForAllLocks' ) {
            var data = input.data;
            thatCoordinator._processAllLock( false, data );
        }
    };

    //##abortEpochUpdate
    //`sender:` coordinator for an epoch change operation  
    //`receiver:` fusion quorum of the related epoch change  
    //`effect:` Aborts the epoch update: unlocks the store and clears possible related timeouts
    reactions.abortEpochUpdate = function () {

        owningProcess.storage.unlockAll();

        if ( reactions.voteForEpochChangeControl ) {
            clearTimeout( reactions.voteForEpochChangeControl.timeout );
            reactions.voteForEpochChangeControl = undefined;
        }
        if ( reactions.preCommitEpochDataControl ) {
            clearTimeout( reactions.preCommitEpochDataControl.timeout );
            reactions.preCommitEpochDataControl = undefined;
        }
    };

    //##plainRead
    //`sender:` coordinator for an epoch change operation  
    //`receiver:` fusion quorum of the related epoch change  
    //`input.data`: the key to read  
    //`effect:` reads the value for a key, without checking any locks. Only used for updating a coordinator in an
    //epoch change which has all locks anyways
    reactions.plainRead = function ( input, address ) {
        var key = input.data;
        var data = owningProcess.storage.read( key );
        send( {action: 'plainReadValue',
                data: {key: key,
                    value: data.value,
                    version: typeof data.version !== 'undefined' ?
                        data.version : -1
                },
                port: owningProcess.port},
            address, input.port );
    };

    //##plainReadValue
    //`sender:` process of a fusion quorum of an epoch change  
    //`receiver:` coordinator for this epoch change operation  
    //`input.data`: json object, containing 
    //
    // * `key:` the key which was read, ...
    //
    // * `value:` ... its value ...
    //
    // * `version:` ... and version
    //
    //`effect:` triggers the processPlainRead function which writes the value and 
    // continues with the epoch change when all necessary reads arrived
    reactions.plainReadValue = function ( input ) {
        var data = input.data;
        thatCoordinator._processPlainRead( data.key, data.value, data.version );
    };

    //##preCommitEpochData
    //`sender:` coordinator of an epoch change  
    //`receiver:` fusion quorum members  
    //`input.data`: json object, containing 
    //
    // * `storagePatch:` json object containing current key, value, version triples to update this process
    //
    // * `epoch:` new epoch number
    //
    // * `root:` new voting structure root node
    //
    // * `allProcesses:` current list of processes
    //
    //`effect:` prepares a function to write the new epoch and schedules it. No more
    // passive abortion; timeout will cause a commit
    reactions.preCommitEpochData = function ( input, address ) {
        var data = input.data;

        if ( reactions.voteForEpochChangeControl ) {
            clearTimeout( reactions.voteForEpochChangeControl.timeout );
            reactions.voteForEpochChangeControl = undefined;
        }

        send( {action: 'epochChangeACK',
                port: owningProcess.port},
            address, input.port );

        //As this data is not new but the most recent, we don't have to
        //wait for the commit message
        owningProcess.storage.patch( data.storagePatch );


        reactions.preCommitEpochDataControl = {};
        reactions.preCommitEpochDataControl.func = function () {
            clearTimeout( reactions.preCommitEpochDataControl.timeout );
            reactions.preCommitEpochDataControl = undefined;

            thatCoordinator.epoch = data.epoch;
            thatCoordinator.root = addParentEdges( data.root );
            owningProcess.allProcesses = data.allProcesses;

            owningProcess.storage.unlockAll();
        };

        reactions.preCommitEpochDataControl.timeout = setTimeout(
            reactions.preCommitEpochDataControl.func,
            options.coordination.epochChange.preCommit.timeout
        );
    };

    //##epochChangeACK
    //`sender:` process of a fusion quorum of an epoch change  
    //`receiver:` coordinator for this epoch change operation  
    //`effect:` triggers the coordinators epochAcknowledged function to process the acknowledgement
    // and proceed when he gets all
    reactions.epochChangeACK = function () {
        thatCoordinator._epochAcknowledged();
    };

    //##commitEpochChange
    //`sender:` coordinator of an epoch change operation  
    //`receiver:` fusion quorum members  
    //`effect:` calls the committing function and thus completes the epoch change
    reactions.commitEpochChange = function () {
        clearTimeout( reactions.preCommitEpochDataControl.timeout );
        reactions.preCommitEpochDataControl.func();
        thatCoordinator.gotAnEpochChange( true );
    };


    //#Write Reactions
    /*
     */

    //##voteForWrite
    //`sender:` coordinator for a write operation  
    //`receiver:` all processes from the related write quorum  
    //`input.data:` key to lock if possible  
    //`effect:`  If the transmitted key has no write lock, it's locked and the
    //replica information including the key, version, this process and it's epoch
    //will be send back.  
    //Afterwards a timeout for the expected preparation message is set  
    //Otherwise, a negative vote is send.
    reactions.voteForWrite = function ( input, address ) {
        var key = input.data;

        if ( owningProcess.storage.canWrite( key ) ) {
            var version = owningProcess.storage.getVersion( key );
            owningProcess.storage.lockWrite( key );

            send( {action: 'voteYes',
                    data: {key: key,
                        version: version,
                        process: owningProcess.getMeAsJson(),
                        epoch: thatCoordinator.epoch},
                    port: owningProcess.port},
                address, input.port );


            reactions.voteForWrite[key] = {};
            reactions.voteForWrite[key].func = function () {
                clearTimeout( reactions.voteForWrite[key].timeout );
                reactions.voteForWrite[key] = undefined;

                owningProcess.storage.unlockWrite( key );
            };

            reactions.voteForWrite[key].timeout = setTimeout(
                reactions.voteForWrite[key].func,
                options.coordination.voting.timeToRollback );

        } else {
            send( {action: 'voteNo',
                    data: {key: key,
                        process: owningProcess.getMeAsJson(),
                        epoch: thatCoordinator.epoch},
                    port: owningProcess.port},
                address, input.port );
        }
    };

    //##voteYes
    //`sender:` a process from a write quorum  
    //`receiver:` coordinator of the related write operation  
    //`input.data:` json object, containing
    //
    // * `key:` key, for which the vote was casted
    //
    // * `version:` version number of the value related to the key
    //
    // * `process:` the process which casted the vote
    //
    // * `epoch:` epoch number of said process
    //
    //`effect:` triggers the vote collecting function positively with the received data
    reactions.voteYes = function ( input ) {
        if ( thatCoordinator.state.name === 'waitForVotes' ) {
            var data = input.data;
            thatCoordinator._processVote( true, data );
        }
    };

    //##voteNo
    //`sender:` a process from a write quorum  
    //`receiver:` coordinator of the related write operation  
    //`input.data:` json object, containing
    //
    // * `key:` key, for which the vote was casted
    //
    // * `process:` the process which casted the vote
    //
    // * `epoch:` epoch number of said process
    //
    //`effect:` triggers the vote collecting function negatively with the received data
    reactions.voteNo = function ( input ) {
        if ( thatCoordinator.state.name === 'waitForVotes' ) {
            var data = input.data;
            thatCoordinator._processVote( false, data );
        }
    };

    //##abortWrite
    //`sender:` coordinator of a write operation  
    //`receiver:` the part of the quorum, which voted positively  
    //`input.data:` key for which the write process shall be aborted  
    //`effect:` unlocks the write lock for the key and cleans up the timeouts
    reactions.abortWrite = function ( input ) {
        var key = input.data;
        if ( reactions.voteForWrite[key] ) {
            reactions.voteForWrite[key].func();
        }
    };

    //##prepareCommit
    //`sender:` coordinator of a write operation  
    //`receiver:` related write quorum  
    //`input.data:` json object, containing
    //
    // * `key:` key to prepare the commit for
    //
    // * `value:` new value for this key
    //
    // * `version:` version number for this key
    //
    //`effect:` prepares a function to write the new data and schedules it. No more
    // passive abortion; timeout will cause a commit
    reactions.prepareCommit = function ( input, address ) {
        var key = input.data.key;
        var value = input.data.value;
        var version = input.data.version;

        if ( reactions.voteForWrite[key] ) {
            clearTimeout( reactions.voteForWrite[key].timeout );
            reactions.voteForWrite[key] = undefined;

            send( {action: 'processACK',
                    data: key,
                    port: owningProcess.port},
                address, input.port );

            reactions.committing = {};
            reactions.committing[key] = {};
            reactions.committing[key].func = function () {
                //`Todo: find out, why reactions.committing[key] can be undefined at this point... :/`
                if ( reactions.committing[key] ) {
                    clearTimeout( reactions.committing[key].timeout );
                    reactions.committing[key] = undefined;
                    owningProcess.storage.write( key, value, version );
                    owningProcess.storage.unlockWrite( key );
                }
            };
            reactions.committing[key].timeout = setTimeout(
                reactions.committing[key].func,
                options.coordination.write.waitForCommit.timeout );
        }
    };

    //##abortCommit
    //`sender:` coordinator of a write operation  
    //`receiver:` whole write quorum   
    //`input.data:` key to abort the commit for  
    //`effect:` aborts the pending commit for this key
    reactions.abortCommit = function ( input ) {
        var key = input.data;
        owningProcess.storage.unlockWrite( key );
        if ( reactions.committing[key] ) {
            clearTimeout( reactions.committing[key].timeout );
            reactions.committing[key] = undefined;
        }
    };

    //##processACK
    //`sender:` member of a write quorum  
    //`receiver:` coordinator of the corresponding write  
    //`effect:` triggers the collection of the vote
    reactions.processACK = function () {
        if ( thatCoordinator.state.name === 'waitForACK' ) {
            thatCoordinator._voteForWrite();
        }
    };

    //##commit
    //`sender:` coordinator of a write operation  
    //`receiver:` corresponding write quorum  
    //`input.data:` key to commit  
    //`effect:` immediately triggers the commit and cleans up the timeouts
    reactions.commit = function ( input ) {
        var key = input.data;
        if ( reactions.committing[key] ) {
            reactions.committing[key].func();
        }
    };
    //#Read reactions
    /*
     */

    //##lockForRead
    //`sender:` coordinator of a read operation  
    //`receiver:` all processes of the related read quorum      
    //`input.data:` key to lock if possible  
    // `effect:`  If the involved key has no read lock, it's locked and the
    //replica information including the key, this process and it's epoch
    //will be send back.  
    //Afterwards a timeout for the expected read message is set  
    //Otherwise, a negative answer is send.
    reactions.lockForRead = function ( input, address ) {

        var key = input.data;
        if ( owningProcess.storage.canRead( key ) ) {
            owningProcess.storage.lockRead( key );

            send( {action: 'readLocked',
                    data: {key: key,
                        process: owningProcess.getMeAsJson(),
                        epoch: thatCoordinator.epoch},
                    port: owningProcess.port},
                address, input.port );

            reactions.readLock = {};
            reactions.readLock[key] = {};
            reactions.readLock[key].func = function () {
                if ( reactions.readLock[key] ) {
                    clearTimeout( reactions.readLock[key].timeout );
                    reactions.readLock[key] = undefined;
                }
                owningProcess.storage.unlockRead( key );
            };

            reactions.readLock[key].timeout = setTimeout(
                reactions.readLock[key].func,
                options.coordination.voting.timeToRollback );

        } else {
            send( {action: 'readNotLocked',
                    data: {key: key,
                        process: owningProcess.getMeAsJson(),
                        epoch: thatCoordinator.epoch},
                    port: owningProcess.port},
                address, input.port );
        }
    };

    //##readLocked
    //`sender:` a process from a read quorum  
    //`receiver:` coordinator of the related read operation  
    //`input.data:` json object, containing
    //
    // * `key:` key, for which the read was locked
    //
    // * `process:` the process which locked the key
    //    
    // `effect:` triggers the processing function positively with the received data
    reactions.readLocked = function ( input ) {
        if ( thatCoordinator.state.name === 'waitForLocks' ) {
            var data = input.data;
            thatCoordinator._processReadLock( true, data );
        }
    };

    //##readNotLocked
    //`sender:` a process from a read quorum  
    //`receiver:` coordinator of the related read operation  
    //`input.data:` json object, containing
    //
    // * `key:` key, for which the read could not be locked
    //
    // * `process:` the process which could not lock the key
    //    
    //`effect:` triggers the processing function negatively with the received data
    reactions.readNotLocked = function ( input ) {
        if ( thatCoordinator.state.name === 'waitForLocks' ) {
            var data = input.data;
            thatCoordinator._processReadLock( false, data );
        }
    };

    //##abortRead
    //`sender:` coordinator of a read operation  
    //`receiver:` members of the read quorum (subset depending on the actual invocation of the abort)  
    //`input.data:` key to abort the read for  
    //`effect:` unlocks the read lock for the key and cleans up the timeouts
    reactions.abortRead = function ( input ) {
        var key = input.data;
        if ( reactions.readLock[key] ) {
            reactions.readLock[key].func();
        }
    };

    //##read
    //`sender:` coordinator of the read operation  
    //`receiver:` corresponding read quorum  
    //`input.data:` key to read  
    //`effect:` reads the value corresponding to the key, unlocks the key 
    // and sends the read value to the coordinator
    reactions.read = function ( input, address ) {
        var key = input.data;
        if ( reactions.readLock[key] ) {
            clearTimeout( reactions.readLock[key].timeout );
            reactions.readLock[key] = undefined;

            var data = owningProcess.storage.read( key );
            send( {action: 'readValue',
                    data: {key: key,
                        value: data.value,
                        version: typeof data.version !== 'undefined' ?
                            data.version : -1
                    },
                    port: owningProcess.port},
                address, input.port );
            owningProcess.storage.unlockRead( key );
        }
    };

    //##readValue
    //`sender:` member of a read quorum  
    //`receiver:` corresponding coordinator  
    //`input.data:` json object, containing
    //
    // * `key:` key, which was read, ...
    //    
    // * `value:` ... it's value ...
    //    
    // * `version:` .. and version
    //    
    //`effect:` triggers the final read processing
    reactions.readValue = function ( input ) {
        var data = input.data;
        thatCoordinator._processRead( data.key, data.value, data.version );
    };

};

module.exports = Reactions;
