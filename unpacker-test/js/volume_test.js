// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

describe('Volume', function() {
  /**
   * Fake metadata used to test volume's methods.
   * @type {Object.<string, Object>}
   */
  var METADATA = {
    name: '/',
    size: 0,
    isDirectory: true,
    modificationTime: 3000 /* In seconds. */,
    entries: {
      'file': {name: 'file1', size: 50, isDirectory: false,
               modificationTime: 20000 /* In seconds. */},
      'dir': {name: 'dir', size: 0, isDirectory: true,
              modificationTime: 12000 /* In seconds. */,
              entries: {
                'insideFile': {name: 'insideFile', size: 45, isDirectory: false,
                               modificationTime: 200 /* In seconds. */}
              }}
    }
  };

  /**
   * A fake entry. Will be used outside for restore purposes.
   * @type {Entry}
   * @const
   */
  var ENTRY = null;

  /**
   * @type {number}
   * @const
   */
  var METADATA_REQUEST_ID = 1;

  /**
   * @type {number}
   * @const
   */
  var OPEN_REQUEST_ID = 2;

  /**
   * @type {number}
   * @const
   */
  var READ_REQUEST_ID = 3;

  /**
   * @type {number}
   * @const
   */
  var CLOSE_REQUEST_ID = 4;

  var volume;
  var decompressor;
  var onReadMetadataSuccessSpy;
  var onReadMetadataErrorSpy;

  beforeEach(function() {
    volume = null;
    decompressor = {
      readMetadata: sinon.stub(),
      openFile: sinon.stub(),
      closeFile: sinon.stub(),
      readFile: sinon.stub()
    };

    onReadMetadataSuccessSpy = sinon.spy();
    onReadMetadataErrorSpy = sinon.spy();

    volume = new Volume(decompressor, ENTRY);
  });

  it('should have null metadata before calling readMetadata', function() {
    expect(volume.metadata).to.be.null;
  });

  it('should have correct entry', function() {
    expect(volume.entry).to.equal(ENTRY);
  });

  it('should have empty openedFiles member', function() {
    expect(Object.keys(volume.openedFiles).length).to.equal(0);
  });

  // Invalid metadata.
  describe('that reads invalid metadata', function() {
    beforeEach(function() {
      decompressor.readMetadata.callsArg(2);
      volume.readMetadata(onReadMetadataSuccessSpy, onReadMetadataErrorSpy);
    });

    it('should not call onSuccess for volume.readMetadata', function() {
      expect(onReadMetadataSuccessSpy.called).to.be.false;
    });

    it('should call onError for volume.readMetadata', function() {
      expect(onReadMetadataErrorSpy.calledOnce).to.be.true;
    });
  });

  // Valid metadata.
  describe('that reads correct metadata', function() {
    beforeEach(function() {
      decompressor.readMetadata.callsArgWith(1, METADATA);
      volume.readMetadata(onReadMetadataSuccessSpy, onReadMetadataErrorSpy);
    });

    it('should call onSuccess for volume.readMetadata', function() {
      expect(onReadMetadataSuccessSpy.calledOnce).to.be.true;
    });

    it('should not call onError for volume.readMetadata', function() {
      expect(onReadMetadataErrorSpy.called).to.be.false;
    });

    it('should be ready to use', function() {
      expect(volume.isReady()).to.be.true;
    });

    it('should have METADATA.length entries', function() {
      expect(Object.keys(volume.metadata).length)
          .to.equal(Object.keys(METADATA).length);
    });

    // Test root directory.
    describe('which should be the root entry', function() {
      it('that is valid', function() {
        expect(volume.metadata).to.not.be.undefined;
      });

      it('that is a directory', function() {
        expect(volume.metadata.isDirectory).to.be.true;
      });

      it('that has correct size', function() {
        expect(volume.metadata.size).to.equal(METADATA.size);
      });

      it('that has correct number of ms for modification time', function() {
        expect(volume.metadata.modificationTime.getTime()).
            to.equal(METADATA.modificationTime * 1000);
      });
    });

    // Test file entry.
    describe('should have a file entry', function() {
      it('that is valid', function() {
        expect(volume.metadata.entries['file']).to.not.be.undefined;
      });

      it('that is not a directory', function() {
        expect(volume.metadata.entries['file'].isDirectory).to.be.false;
      });

      it('that has correct size', function() {
        expect(volume.metadata.entries['file'].size)
            .to.equal(METADATA.entries['file'].size);
      });

      it('that has correct number of ms for modification time', function() {
        expect(volume.metadata.entries['file'].modificationTime.getTime()).
            to.equal(METADATA.entries['file'].modificationTime * 1000);
      });
    });

    // Test onGetMetadataRequested.
    describe('and calls onGetMetadataRequested', function() {
      var onSuccessSpy;
      var onErrorSpy;
      beforeEach(function() {
        onSuccessSpy = sinon.spy();
        onErrorSpy = sinon.spy();
      });

      // Invalid entry path.
      describe('with invalid entryPath', function() {
        beforeEach(function() {
          var options = {entryPath: '/invalid/path'};
          volume.onGetMetadataRequested(options, onSuccessSpy, onErrorSpy);
        });

        it('should not call onSuccess', function() {
          expect(onSuccessSpy.called).to.be.false;
        });

        it('should call onError with NOT_FOUND', function() {
          expect(onErrorSpy.calledWith('NOT_FOUND')).to.be.true;
        });
      });

      // Valid entry path for root.
      describe('with valid entryPath as root', function() {
        beforeEach(function() {
          var options = {entryPath: '/'};
          volume.onGetMetadataRequested(options, onSuccessSpy, onErrorSpy);
        });

        it('should not call onError', function() {
          expect(onErrorSpy.called).to.be.false;
        });

        it('should call onSuccess with the entry metadata', function() {
          expect(onSuccessSpy.calledWith(volume.metadata)).to.be.true;
        });
      });

      // Valid entry path for a directory inside root.
      describe('with valid directory entryPath', function() {
        beforeEach(function() {
          var options = {entryPath: '/dir/'};
          volume.onGetMetadataRequested(options, onSuccessSpy, onErrorSpy);
        });

        it('should not call onError', function() {
          expect(onErrorSpy.called).to.be.false;
        });

        it('should call onSuccess with the entry metadata', function() {
          expect(onSuccessSpy.calledWith(
              volume.metadata.entries['dir'])).to.be.true;
        });
      });

      // Valid entry path for a file inside a directory.
      describe('with valid file entryPath', function() {
        beforeEach(function() {
          var options = {entryPath: '/dir/insideFile'};
          volume.onGetMetadataRequested(options, onSuccessSpy, onErrorSpy);
        });

        it('should not call onError', function() {
          expect(onErrorSpy.called).to.be.false;
        });

        it('should call onSuccess with the entry metadata', function() {
          expect(onSuccessSpy.calledWith(
              volume.metadata.entries['dir'].entries['insideFile'])).to.be.true;
        });
      });
    });  // Test onGetMetadataRequested.

    // Test onReadDirectoryRequested.
    describe('and calls onReadDirectoryRequested', function() {
      var onSuccessSpy;
      var onErrorSpy;
      beforeEach(function() {
        onSuccessSpy = sinon.spy();
        onErrorSpy = sinon.spy();
      });

      // Invalid directory path.
      describe('with invalid directoryPath', function() {
        beforeEach(function() {
          var options = {directoryPath: '/invalid'};
          volume.onReadDirectoryRequested(options, onSuccessSpy,
              onErrorSpy);
        });

        it('should not call onSuccess', function() {
          expect(onSuccessSpy.called).to.be.false;
        });

        it('should call onError with NOT_FOUND', function() {
          expect(onErrorSpy.calledWith('NOT_FOUND')).to.be.true;
        });
      });

      // Normal file that is not a directory.
      describe('with a file that is not a directory', function() {
        beforeEach(function() {
          var options = {directoryPath: '/file'};
          volume.onReadDirectoryRequested(options, onSuccessSpy,
              onErrorSpy);
        });

        it('should not call onSuccess', function() {
          expect(onSuccessSpy.called).to.be.false;
        });

        it('should call onError with NOT_A_DIRECTORY', function() {
          expect(onErrorSpy.calledWith('NOT_A_DIRECTORY')).to.be.true;
        });
      });

      // Valid directory.
      describe('with a valid directory', function() {
        beforeEach(function() {
          var options = {directoryPath: '/'};
          volume.onReadDirectoryRequested(options, onSuccessSpy,
              onErrorSpy);
        });

        it('should not call onError', function() {
          expect(onErrorSpy.called).to.be.false;
        });

        it('should call onSuccess with the directory entries', function() {
          var entries = [
            volume.metadata.entries['file'],
            volume.metadata.entries['dir']
          ];
          expect(onSuccessSpy.calledWith(entries, false)).to.be.true;
        });
      });  // Valid directory.
    });  // Test onReadDirectoryRequested.

    // Test onOpenFileRequested.
    describe('and calls onOpenFileRequested', function() {
      var onSuccessSpy;
      var onErrorSpy;
      beforeEach(function() {
        onSuccessSpy = sinon.spy();
        onErrorSpy = sinon.spy();
      });

      // Invalid option.mode.
      describe('with invalid options.mode', function() {
        beforeEach(function() {
          var options = {mode: 'invalid', create: false, filePath: '/file'};
          volume.onOpenFileRequested(options, onSuccessSpy, onErrorSpy);
        });

        it('should not call onSuccess', function() {
          expect(onSuccessSpy.called).to.be.false;
        });

        it('should call onError with INVALID_OPERATION', function() {
          expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
        });
      });

      // Invalid option.create.
      describe('with options.create as true', function() {
        beforeEach(function() {
          var options = {mode: 'READ', create: true, filePath: '/file'};
          volume.onOpenFileRequested(options, onSuccessSpy, onErrorSpy);
        });

        it('should not call onSuccess', function() {
          expect(onSuccessSpy.called).to.be.false;
        });

        it('should call onError with INVALID_OPERATION', function() {
          expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
        });
      });

      // Inexistent file path.
      describe('with inexistent filePath', function() {
        beforeEach(function() {
          var options = {mode: 'READ', create: false, filePath: '/invalid'};
          volume.onOpenFileRequested(options, onSuccessSpy, onErrorSpy);
        });

        it('should not call onSuccess', function() {
          expect(onSuccessSpy.called).to.be.false;
        });

        it('should call onError with NOT_FOUND', function() {
          expect(onErrorSpy.calledWith('NOT_FOUND')).to.be.true;
        });
      });

      // Valid open file options.
      describe('with valid options', function() {
        var options;
        beforeEach(function() {
          options = {
            mode: 'READ',
            create: false,
            requestId: OPEN_REQUEST_ID,
            filePath: '/file'
          };
          decompressor.openFile.withArgs(
              options.requestId, options.filePath).callsArg(2);

          expect(volume.openedFiles[options.requestId]).to.be.undefined;
          volume.onOpenFileRequested(options, onSuccessSpy, onErrorSpy);
        });

        it('should not call onError', function() {
          expect(onErrorSpy.called).to.be.false;
        });

        it('should call onSuccess', function() {
          expect(onSuccessSpy.called).to.be.true;
        });

        it('should add open operation options to openedFiles', function() {
          expect(volume.openedFiles[options.requestId]).to.equal(options);
        });

        // Test onCloseFileRequested.
        describe('and calls onCloseFileRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
          });

          describe('with invalid openRequestId', function() {
            beforeEach(function() {
              var options = {
                requestId: CLOSE_REQUEST_ID,
                openRequestId: -1
              };
              volume.onCloseFileRequested(options, onSuccessSpy,
                  onErrorSpy);
            });

            it('should call onError', function() {
              expect(onErrorSpy.called).to.be.true;
            });

            it('should not call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.false;
            });
          });

          // Valid openRequestId.
          describe('with valid openRequestId', function() {
            beforeEach(function() {
              onSuccessSpy = sinon.spy();
              onErrorSpy = sinon.spy();
              var options = {
                requestId: CLOSE_REQUEST_ID,
                openRequestId: OPEN_REQUEST_ID
              };
              decompressor.closeFile.withArgs(
                  options.requestId, options.openRequestId).callsArg(2);

              volume.onCloseFileRequested(options, onSuccessSpy,
                  onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.true;
            });

            it('should remove open operation options from openedFiles',
                function() {
              expect(volume.openedFiles[options.requestId]).to.be.undefined;
            });
          });  // Valid openRequestId.
        });  // Test onCloseFileRequested.

        // Test onReadFileRequested.
        describe('and calls onReadFileRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
          });

          // Invalid openRequestId.
          describe('with invalid openRequestId', function() {
            beforeEach(function() {
              var options = {
                requestId: READ_REQUEST_ID,
                openRequestId: -1,
                offset: 20,
                length: 50
              };
              volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should call onError', function() {
              expect(onErrorSpy.called).to.be.true;
            });

            it('should not call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.false;
            });
          });

          // Length 0.
          describe('with length 0', function() {
            beforeEach(function() {
              var options = {
                requestId: READ_REQUEST_ID,
                openRequestId: OPEN_REQUEST_ID,
                offset: 0,
                length: 0
              };
              volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess with empty buffer and no more data',
                function() {
              expect(onSuccessSpy.calledWith(
                  new ArrayBuffer(0), false /* No more data. */)).to.be.true;
            });
          });

          // Offset equal to file size.
          describe('with offset = file size', function() {
            beforeEach(function() {
              var options = {
                requestId: READ_REQUEST_ID,
                openRequestId: OPEN_REQUEST_ID,
                offset: METADATA.entries['file'].size,
                length: METADATA.entries['file'].size / 2
              };
              // Call is not forwarded to decompressor as request returns 0
              // bytes.
              volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess with empty buffer and no more data',
                function() {
              expect(onSuccessSpy.calledWith(
                  new ArrayBuffer(0), false /* No more data. */)).to.be.true;
            });
          });

          // Offset > file size.
          describe('with offset > file size', function() {
            beforeEach(function() {
              var options = {
                requestId: READ_REQUEST_ID,
                openRequestId: OPEN_REQUEST_ID,
                offset: METADATA.entries['file'].size * 2,
                length: METADATA.entries['file'].size / 2
              };
              // Call is not forwarded to decompressor as request returns 0
              // bytes.
              volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess with empty buffer and no more data',
                function() {
              expect(onSuccessSpy.calledWith(
                  new ArrayBuffer(0), false /* No more data. */)).to.be.true;
            });
          });

          // Offset 0 and length < file size.
          describe('with offset 0 and length < file size', function() {
            beforeEach(function() {
              var options = {
                requestId: READ_REQUEST_ID,
                openRequestId: OPEN_REQUEST_ID,
                offset: 0,
                length: 1
              };
              decompressor.readFile.withArgs(
                  options.requestId, options.openRequestId, options.offset,
                  options.length).callsArgWith(
                      4 /* onSuccessSpy. */, new ArrayBuffer(1), false);

              volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess with correct buffer and no more data',
                function() {
              expect(onSuccessSpy.calledWith(
                  new ArrayBuffer(1), false /* No more data. */)).to.be.true;
            });
          });

          // Offset 0 and length > file size.
          describe('with offset 0 and length > file size', function() {
            var maxLength;
            beforeEach(function() {
              var options = {
                requestId: READ_REQUEST_ID,
                openRequestId: OPEN_REQUEST_ID,
                offset: 0,
                length: METADATA.entries['file'].size * 2
              };

              maxLength = METADATA.entries['file'].size;
              decompressor.readFile.withArgs(
                  options.requestId, options.openRequestId, options.offset,
                  maxLength).callsArgWith(
                      4 /* onSuccessSpy. */, new ArrayBuffer(maxLength), false);

              volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess with correct buffer and no more data',
                function() {
              expect(onSuccessSpy.calledWith(new ArrayBuffer(maxLength), false))
                  .to.be.true;
            });
          });  // Offset 0 and length > file size.
        });  // Test onReadFileRequested.
      });  // Valid options.
    });  // Test onOpenFileRequested.

    // Test onCloseFileRequested.
    describe('and calls onCloseFileRequested before onOpenFileRequested',
             function() {
      var onSuccessSpy;
      var onErrorSpy;
      beforeEach(function() {
        onSuccessSpy = sinon.spy();
        onErrorSpy = sinon.spy();
        var options = {
          requestId: CLOSE_REQUEST_ID,
          openRequestId: OPEN_REQUEST_ID
        };
        volume.onCloseFileRequested(options, onSuccessSpy, onErrorSpy);
      });

      it('should not call onSuccess', function() {
        expect(onSuccessSpy.called).to.be.false;
      });

      it('should call onError with INVALID_OPERATION', function() {
        expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
      });
    });  // Test onCloseFileRequested.

    // Test onReadFileRequested.
    describe('and calls onReadFileRequested before onOpenFileRequested',
             function() {
      var onSuccessSpy;
      var onErrorSpy;
      beforeEach(function() {
        onSuccessSpy = sinon.spy();
        onErrorSpy = sinon.spy();
        var options = {
          requestId: READ_REQUEST_ID,
          openRequestId: OPEN_REQUEST_ID
        };
        volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
      });

      it('should not call onSuccess', function() {
        expect(onSuccessSpy.called).to.be.false;
      });

      it('should call the decompressor with correct request', function() {
        expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
      });
    });  // Test onReadFileRequested.
  });  // Valid metadata.
});