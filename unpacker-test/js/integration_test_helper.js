// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * A helper namespace used by integration_tests.js.
 */
var tests_helper = {
  /**
   * The base URL where all test archives are located.
   * @type {string}
   * @private
   * @const
   */
  TEST_FILES_BASE_URL_: 'http://localhost:9876/base-test/test-files/',

  /**
   * The path to the NaCl nmf file.
   * "base/" prefix is required because Karma prefixes every file path with
   * "base/" before serving it.
   * @type {string}
   * @const
   */
  MODULE_NMF_FILE_PATH: 'base/newlib/Debug/module.nmf',

  /**
   * The mime type of the module.
   * @type {string}
   * @const
   */
  MODULE_MIME_TYPE: 'application/x-nacl',

  /**
   * Define information for the volumes to check.
   * @type {Array.<Object>}
   */
  volumesInformation: [],

  /**
   * The local storage that contains the volumes state to restore after suspend
   * event, restarts, crashes, etc. The key is used to differentiate between
   * different values stored in the local storage. For our extension only
   * app.STORAGE_KEY is used.
   * @type {Object.<string, Object>}
   */
  localStorageState: {},

  /**
   * Downloads a file in order to use it inside the tests. The download
   * operation is required in order to obtain a Blob object for the file,
   * object that is needed by the Decompressor to read the archive's file data
   * or other file's content that must be compared.
   * @param {string} filePath The file path in 'test-files/' directory.
   * @return {Promise} A promise that fulfills with the file's blob or rejects
   *     with the download failure error.
   */
  getFileBlob: function(filePath) {
    return new Promise(function(fulfill, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', tests_helper.TEST_FILES_BASE_URL_ + filePath);
      xhr.responseType = 'blob';

      xhr.onload = fulfill.bind(null, xhr);

      xhr.onerror = reject.bind(null, xhr);

      xhr.send(null);
    }).then(function(xhr) {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          return xhr.response;  // The blob.
        } else {
          return Promise.reject(xhr.statusText + ': ' + filePath);
        }
      }
    }, function(xhr) {
      return Promise.reject(xhr.statusText + ': ' + filePath);
    });
  },

  /**
   * Downloads a file's blob and converts it to an Int8Array that can be used
   * for comparisons.
   * @param {string} filePath The file path in 'test-files/' directory.
   * @return {Promise} A Promise which fulfills with the data as an Int8Array or
   *     rejects with any received error.
   */
  getAndReadFileBlobPromise: function(filePath) {
    return tests_helper.getFileBlob(filePath).then(function(blob) {
      return new Promise(function(fulfill, reject) {
        var fileReader = new FileReader();
        fileReader.onload = function(event) {
          fulfill(new Int8Array(event.target.result));
        };
        fileReader.onerror = reject;
        fileReader.readAsArrayBuffer(blob);
      });
    });
  },


  /**
   * Initializes Chrome APIs.
   */
  initChromeApis: function() {
    // Local storage API.
    chrome.storage = {
      local: {
        set: function() {
          // 'set' must be a function before we can stub it with a custom
          // function. This is a sinon requirement.
        },
        get: sinon.stub()
      }
    };
    // Make a deep copy as tests_helper.localStorageState is the data on the
    // local storage and not in memory. This way the extension will work on a
    // different memory which is the case in real scenarios.
    var localStorageState =
        JSON.parse(JSON.stringify(tests_helper.localStorageState));
    chrome.storage.local.get.withArgs([app.STORAGE_KEY])
        .callsArgWith(1, localStorageState);
    chrome.storage.local.get.throws(
        'Invalid argument for get.' /* If app.STORAGE_KEY is invalid. */);

    sinon.stub(chrome.storage.local, 'set', function(state) {
      // Save the state in the local storage in a different memory.
      tests_helper.localStorageState = JSON.parse(JSON.stringify(state));
    });

    // File system API.
    chrome.fileSystem = {
      retainEntry: sinon.stub(),
      restoreEntry: sinon.stub(),
      getDisplayPath: sinon.stub()
    };

    tests_helper.volumesInformation.forEach(function(volume) {
      chrome.fileSystem.retainEntry.withArgs(volume.entry)
          .returns(volume.entryId);
      chrome.fileSystem.restoreEntry.withArgs(volume.entryId)
          .callsArgWith(1, volume.entry);
      chrome.fileSystem.getDisplayPath.withArgs(volume.entry)
          .callsArgWith(1, volume.fileSystemId);
    });
    chrome.fileSystem.retainEntry.throws('Invalid argument for retainEntry.');
    chrome.fileSystem.restoreEntry.throws('Invalid argument for restoreEntry.');
    chrome.fileSystem.getDisplayPath.throws(
        'Invalid argument for displayPath.');

    // File system provider API.
    chrome.fileSystemProvider = {
      mount: sinon.stub(),
      unmount: sinon.stub()
    };
    tests_helper.volumesInformation.forEach(function(volume) {
      chrome.fileSystemProvider.mount
          .withArgs({fileSystemId: volume.fileSystemId,
                     displayName: volume.entry.name})
          .callsArg(1);
      chrome.fileSystemProvider.unmount
          .withArgs({fileSystemId: volume.fileSystemId})
          .callsArg(1);
    });
    chrome.fileSystemProvider.mount.throws('Invalid argument for mount.');
    chrome.fileSystemProvider.unmount.throws('Invalid argument for unmount.');

    // Chrome runtime API.
    chrome.runtime = {
      // Contains 'lastError' property which is checked in case
      // chrome.fileSystem.restoreEntry fails. By default 'lastError' should be
      // undefined as no error is returned.
    };
  },

  /**
   * Initializes the tests helper. Should call Promise.then to finish
   * initialization as it is done asynchronously.
   * @param {Array.<Object>} archivesToTest A list with data about
   *     archives to test. The archives should be present in 'test-files/'
   *     directory. It has 4 properties: 'name', a string representing the
   *     archive's name which has the same value as the file system id,
   *     'afterOnLaunchTests', the tests to run after on launch event,
   *     'afterSuspendTests', the tests to run after suspend page event and
   *     'afterRestartTests', which are the tests to run after restart.
   * @return {Promise} A promise that will finish initialization asynchronously.
   */
  init: function(archivesToTest) {
    // Create promises to obtain archives blob.
    return Promise.all(archivesToTest.map(function(archiveData) {
      // Inititialization is done outside of the promise in order for Mocha to
      // correctly identify the number of tests_helper.volumesInformation when
      // it initialiazes tests. In case this is done in the promise, Mocha
      // will think there is no volumeInformation because at the time the
      // JavaScript test file is parssed tests_helper.volumesInformation will
      // still be empty.
      var fileSystemId = archiveData.name;

      var volumeInformation = {
        expectedMetadata: archiveData.expectedMetadata,
        fileSystemId: fileSystemId,
        entry: {
          file: null,  // Lazy initialization in Promise.
          name: archiveData.name + '_name'
        },
        /**
         * Default type is Entry, but we can't create an Entry object directly
         * with new. String should work because chrome APIs are stubbed.
         */
        entryId: archiveData.name + '_entry',
        /**
         * A functions with archive's tests to run after on launch event.
         * @type {function()}
         */
        afterOnLaunchTests: archiveData.afterOnLaunchTests,
        /**
         * A functions with archive's tests to run after suspend page event.
         * These tests are similiar to above tests just that they should restore
         * volume's state and opened files.
         * @type {function()}
         */
        afterSuspendTests: archiveData.afterSuspendTests,
        /**
         * A functions with archive's tests to run after restart.
         * These tests are similiar to above tests just that they should restore
         * only the volume's state.
         * @type {function()}
         */
        afterRestartTests: archiveData.afterRestartTests
      };

      tests_helper.volumesInformation.push(volumeInformation);

      return tests_helper.getFileBlob(archiveData.name).then(function(blob) {
        volumeInformation.entry.file = sinon.stub().callsArgWith(0, blob);
      });
    }));
  },

  /**
   * Create a read file request promise.
   * @param {string} fileSystemId The file system id.
   * @param {number} readRequestid The read request id.
   * @param {number} openRequestId The open request id.
   * @param {number} offset The offset from where read should be done.
   * @param {number} length The number of bytes to read.
   * @return {Promise} A read file request promise. It fulfills with an
   *     Int8Array buffer containing the requested data or rejects with
   *     ProviderError.
   */
  createReadFilePromise: function(fileSystemId, readRequestId, openRequestId,
                                  offset, length) {
    var options = {
      fileSystemId: fileSystemId,
      requestId: readRequestId,
      openRequestId: openRequestId,
      offset: offset,
      length: length
    };

    var result = new Int8Array(length);
    var resultOffset = 0;
    return new Promise(function(fulfill, reject) {
      app.onReadFileRequested(options, function(arrayBuffer, hasMore) {
        result.set(new Int8Array(arrayBuffer), resultOffset);
        resultOffset += arrayBuffer.byteLength;

        if (hasMore)  // onSuccess will be called again.
          return;

        // Received less data than requested so truncate result buffer.
        if (resultOffset < length)
          result = result.subarray(0, resultOffset);

        fulfill(result);
      }, reject /* In case of errors just reject with ProviderError. */);
    });
  },

  /**
   * Forces failure in tests. Should be called only from 'beforeEach',
   * 'afterEach' and 'it'. Useful to force failures in promises.
   * @param {Object|strig} An error with stack trace or a string error that
   *     describes the failure reason.
   */
  forceFailure: function(error) {
    console.error(error.stack || error);
    setTimeout(function() {
      expect(false).to.be.true;
    });
  }
};