'use strict';

var Process = require( '../lib/Dares/process.js' );
var Storage = require( '../lib/Dares/storage.js' );
var expect = require( 'chai' ).expect;
var util = require( '../lib/Dares/utility.js' );
var options = require( '../lib/Dares/defaults.js' );


describe( 'Storage', function () {
    var storageProcess;
    var storage;


    before( function () {
        var optionsBase = util.cloneObject( options );
        optionsBase.id = 1;
        optionsBase.port = 9901;
        optionsBase.logging = false;
        storageProcess = new Process( { options: optionsBase }, function () {} );
        storage = new Storage( storageProcess );
    } );


    beforeEach( function () {
        storage.store = {};
        storageProcess.emit = function () {};
    } );


    describe( '#write', function () {
        it( 'should write a new key', function () {
            storageProcess.emit = function ( event, data ) {
                expect( event ).to.be.equal( 'newKey' );
                expect( data.key ).to.be.equal( 'key' );
                expect( data.value ).to.be.equal( 'value' );
                expect( data.version ).to.be.equal( 1 );
                expect( data.timestamp ).to.be.within( Date.now() - 10, Date.now() + 100 );
            };

            expect( storage.write( 'key', 'value', 1 )).to.be.true;
            expect( storage.store.key ).to.be.deep.equal( { value: 'value', version: 1, readable: false, writable: false } );
        } );


        it( 'should overwrite an old key', function () {
            storageProcess.emit = function ( event, data ) {
                expect( event ).to.be.equal( 'change' );
                expect( data.key ).to.be.equal( 'key' );
                expect( data.value ).to.be.equal( 'newValue' );
                expect( data.version ).to.be.equal( 2 );
                expect( data.timestamp ).to.be.within( Date.now() - 10, Date.now() + 100 );
            };

            storage.store.key = {
                value: 'value',
                version: 1,
                readable: false,
                writable: false
            };

            expect( storage.write( 'key', 'newValue', 2 )).to.be.true;
            expect( storage.store.key ).to.be.deep.equal( { value: 'newValue', version: 2, readable: false, writable: false } );
        } );


        it( 'should throw an error if the key is not write locked', function () {
            storage.store.writeLocked = {
                writable: true,
                value: 'value',
                version: 1
            };

            expect( function () {
                storage.write( 'writeLocked', 'value', 2 );
            } ).to.throw( Error, /write called without acquiring the needed locks/ );
        } );


        it( 'should throw an error version to write is less or equal the existing version', function () {
            storage.store.versionKey = {
                value: 'value',
                version: 3,
                readable: false,
                writable: false
            };

            expect( function () {
                storage.write( 'versionKey', 'value', 2 );
            } ).to.throw( Error, /newly written version should be greater than the old one. Version: 2 stored version: 3/ );
        } );
    } );


    describe( '#patch', function () {
        it( 'should be able to write patches', function () {
            storage.patch( {
                patchKey1: {
                    value: 'patchValue1',
                    version: 1
                },
                patchKey2: {
                    value: 'patchValue2',
                    version: 2
                }
            } );

            expect( storage.store ).to.be.deep.equal( {
                patchKey1: {
                    value: 'patchValue1',
                    version: 1,
                    readable: false,
                    writable: false
                },
                patchKey2: {
                    value: 'patchValue2',
                    version: 2,
                    readable: false,
                    writable: false
                }
            } );
        } );
    } );


    describe( '#read', function () {
        it( 'should be able to read an existing key', function () {
            storage.store.key = {
                value: 'newValue',
                version: 2,
                readable: false,
                writable: false
            };

            expect( storage.read( 'key' ) ).to.be.deep.equal( { value: 'newValue', version: 2 } );
        } );

        it( 'should return an empty object for non existing keys', function () {
            expect( storage.read( 'nonExistentKey' ) ).to.be.deep.equal( {} );
        } );

        it( 'should throw an error if the key is not read locked', function () {
            storage.store.readLocked = {
                readable: true,
                value: 'value',
                version: 1
            };

            expect( function () {
                storage.read( 'readLocked' );
            } ).to.throw( Error, /read called without acquiring the needed locks/ );
        } );
    } );


    describe( '#multiRead', function () {
        it( 'should be able to read multiple keys', function () {
            storage.store =  {
                patchKey1: {
                    value: 'patchValue1',
                    version: 1,
                    readable: false,
                    writable: false
                },
                patchKey2: {
                    value: 'patchValue2',
                    version: 2,
                    readable: false,
                    writable: false
                }
            };

            expect( storage.multiRead( ['patchKey1', 'patchKey2'] )).to.be.deep.equal( {
                patchKey1: {
                    value: 'patchValue1',
                    version: 1
                },
                patchKey2: {
                    value: 'patchValue2',
                    version: 2
                }
            } );
        } );

        it( 'should return an empty object for non existing keys', function () {
            expect( storage.multiRead( ['nonExistentKey'] ) ).to.be.deep.equal( {
                nonExistentKey: {}
            } );
        } );
    } );


    describe( '#lockWrite', function () {
        it( 'should lock write for existing keys', function () {
            storage.store.writeLockKey = {
                value: 'writeLockValue',
                version: 1,
                readable: true,
                writable: true
            };
            
            storage.lockWrite( 'writeLockKey' );

            expect( storage.store.writeLockKey.writable ).to.be.false;
            expect( function () {
                storage.lockWrite( 'writeLockKey' );
            } ).to.throw( Error, /write lock is not available/ );
        } );

        it( 'should lock write for non existing keys', function () {
            storageProcess.emit = function ( event, data ) {
                expect( event ).to.be.equal( 'newKey' );
                expect( data.key ).to.be.equal( 'writeLockNewKey' );
                expect( data.value ).to.be.equal( null );
                expect( data.version ).to.be.equal( -1 );
                expect( data.timestamp ).to.be.within( Date.now() - 10, Date.now() + 100 );
            };

            storage.lockWrite( 'writeLockNewKey' );

            expect( storage.store.writeLockNewKey ).to.be.deep.equal( {
                writable: false,
                readable: true,
                value: null,
                version: -1
            } );
        } );
    } );


    describe( '#unlockWrite', function () {
        it( 'should lock write for existing keys', function () {
            storage.store.writeUnlockKey = {
                value: 'writeUnlockValue',
                version: 1,
                readable: false,
                writable: false
            };
            
            storage.unlockWrite( 'writeUnlockKey' );

            expect( storage.store.writeUnlockKey.writable ).to.be.true;
        } );

        it( 'should lock write for non existing keys', function () {
            storageProcess.emit = function ( event, data ) {
                expect( event ).to.be.equal( 'newKey' );
                expect( data.key ).to.be.equal( 'writeUnlockNewKey' );
                expect( data.value ).to.be.equal( null );
                expect( data.version ).to.be.equal( -1 );
                expect( data.timestamp ).to.be.within( Date.now() - 10, Date.now() + 100 );
            };

            storage.unlockWrite( 'writeUnlockNewKey' );

            expect( storage.store.writeUnlockNewKey ).to.be.deep.equal( {
                writable: true,
                readable: true,
                value: null,
                version: -1
            } );
        } );
    } );


    describe( '#lockRead', function () {
        it( 'should lock read for existing keys', function () {
            storage.store.readLockKey = {
                value: 'readLockValue',
                version: 1,
                readable: true,
                writable: true
            };
            
            storage.lockRead( 'readLockKey' );

            expect( storage.store.readLockKey.readable ).to.be.false;
            expect( function () {
                storage.lockRead( 'readLockKey' );
            } ).to.throw( Error, /read lock is not available/ );
        } );

        it( 'should lock read for non existing keys', function () {
            storageProcess.emit = function ( event, data ) {
                expect( event ).to.be.equal( 'newKey' );
                expect( data.key ).to.be.equal( 'readLockNewKey' );
                expect( data.value ).to.be.equal( null );
                expect( data.version ).to.be.equal( -1 );
                expect( data.timestamp ).to.be.within( Date.now() - 10, Date.now() + 100 );
            };

            storage.lockRead( 'readLockNewKey' );

            expect( storage.store.readLockNewKey ).to.be.deep.equal( {
                writable: true,
                readable: false,
                value: null,
                version: -1
            } );
        } );
    } );


    describe( '#unlockRead', function () {
        it( 'should lock read for existing keys', function () {
            storage.store.readUnlockKey = {
                value: 'readUnlockValue',
                version: 1,
                readable: false,
                writable: false
            };
            
            storage.unlockRead( 'readUnlockKey' );

            expect( storage.store.readUnlockKey.readable ).to.be.true;
        } );

        it( 'should lock read for non existing keys', function () {
            storageProcess.emit = function ( event, data ) {
                expect( event ).to.be.equal( 'newKey' );
                expect( data.key ).to.be.equal( 'readUnlockNewKey' );
                expect( data.value ).to.be.equal( null );
                expect( data.version ).to.be.equal( -1 );
                expect( data.timestamp ).to.be.within( Date.now() - 10, Date.now() + 100 );
            };

            storage.unlockRead( 'readUnlockNewKey' );

            expect( storage.store.readUnlockNewKey ).to.be.deep.equal( {
                writable: true,
                readable: true,
                value: null,
                version: -1
            } );
        } );
    } );


    describe( '#canWrite', function () {
        it( 'should tell us correctly whether a key is locked for writing', function () {
            storage.store = {
                key1: {
                    readable: false,
                    writable: false
                },
                key2: {
                    readable: true,
                    writable: false
                },
                key3: {
                    readable: false,
                    writable: true
                },
                key4: {
                    readable: true,
                    writable: true
                }
            };

            expect( storage.canWrite( 'key1' ) ).to.be.false;
            expect( storage.canWrite( 'key2' ) ).to.be.false;
            expect( storage.canWrite( 'key3' ) ).to.be.false;
            expect( storage.canWrite( 'key4' ) ).to.be.true;
        } );

        it( 'should say that a non existing key is writeable', function () {
            expect( storage.canWrite( 'nonExistentKey' ) ).to.be.true;
        } );
    } );


    describe( '#canRead', function () {
        it( 'should tell us correctly whether a key is locked for reading', function () {
            storage.store = {
                key1: {
                    readable: false,
                    writable: false
                },
                key2: {
                    readable: true,
                    writable: false
                },
                key3: {
                    readable: false,
                    writable: true
                },
                key4: {
                    readable: true,
                    writable: true
                }
            };

            expect( storage.canRead( 'key1' ) ).to.be.false;
            expect( storage.canRead( 'key2' ) ).to.be.false;
            expect( storage.canRead( 'key3' ) ).to.be.false;
            expect( storage.canRead( 'key4' ) ).to.be.true;
        } );

        it( 'should say that a non existing key is readable', function () {
            expect( storage.canRead( 'nonExistentKey' ) ).to.be.true;
        } );
    } );


    describe( '#anyOneLocked', function () {
        it( 'should tell us correctly that no key is locked for reading or writing', function () {
            storage.store = {
                key1: {
                    readable: true,
                    writable: true
                },
                key2: {
                    readable: true,
                    writable: true
                }
            };

            expect( storage.anyOneLocked() ).to.be.false;
        } );

        it( 'should tell us correctly that some key is locked for reading or writing', function () {
            storage.store = {
                key1: {
                    readable: true,
                    writable: true
                },
                key2: {
                    readable: true,
                    writable: false
                }
            };

            expect( storage.anyOneLocked() ).to.be.true;
        } );
    } );


    describe( '#allLocked', function () {
        it( 'should tell us correctly that every key has a read and write lock', function () {
            storage.store = {
                key1: {
                    readable: false,
                    writable: false
                },
                key2: {
                    readable: false,
                    writable: false
                }
            };

            expect( storage.allLocked() ).to.be.true;
        } );

        it( 'should tell us correctly that some key is not locked for reading or writing', function () {
            storage.store = {
                key1: {
                    readable: true,
                    writable: false
                },
                key2: {
                    readable: true,
                    writable: true
                }
            };

            expect( storage.allLocked() ).to.be.false;
        } );
    } );


    describe( '#lockAll', function () {
        it( 'should lock all keys', function () {
            storage.store = {
                key1: {
                    readable: true,
                    writable: true
                },
                key2: {
                    readable: true,
                    writable: true
                },
                key3: {
                    readable: true,
                    writable: true
                }
            };

            storage.lockAll();

            expect( storage.store ).to.be.deep.equal( {
                key1: {
                    readable: false,
                    writable: false
                },
                key2: {
                    readable: false,
                    writable: false
                },
                key3: {
                    readable: false,
                    writable: false
                }
            } );
        } );
    } );


    describe( '#unlockAll', function () {
        it( 'should unlock all keys', function () {
            storage.store = {
                key1: {
                    readable: false,
                    writable: false
                },
                key2: {
                    readable: true,
                    writable: false
                },
                key3: {
                    readable: true,
                    writable: true
                }
            };

            storage.unlockAll();

            expect( storage.store ).to.be.deep.equal( {
                key1: {
                    readable: true,
                    writable: true
                },
                key2: {
                    readable: true,
                    writable: true
                },
                key3: {
                    readable: true,
                    writable: true
                }
            } );
        } );
    } );


    describe( '#getVersion', function () {
        it( 'should get the version of an existing key', function () {
            storage.store = {
                key: {
                    value: 'value',
                    version: 2
                }
            };

            expect( storage.getVersion( 'key' )).to.be.equal( 2 );
        } );


        it( 'should return -1 for an non existing key', function () {
            expect( storage.getVersion( 'nonExistentKey' )).to.be.equal( -1 );
        } );
    } );


    describe( '#getKeyVersions', function () {
        it( 'should get the versions of an array of keys', function () {
            storage.store = {
                key1: {
                    value1: 'value1',
                    version: 1
                },
                key2: {
                    value2: 'value2',
                    version: 2
                }
            };

            expect( storage.getKeyVersions( ['key1', 'key2'] )).to.be.deep.equal( {
                key1: {
                    version: 1
                },
                key2: {
                    version: 2
                }
            } );
        } );
    } );


    describe( '#getAll', function () {
        it( 'should return the store', function () {
            storage.store = {
                key1: {
                    value: 'value',
                    version: 1
                },
                key2: {
                    value: 'value',
                    version: 2
                }
            };

            expect( storage.getAll() ).to.be.deep.equal( {
                key1: {
                    value: 'value',
                    version: 1
                },
                key2: {
                    value: 'value',
                    version: 2
                }
            } );
        } );
    } );


    after( function () {
        storageProcess.stop();
    } );
} );
