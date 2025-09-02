(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.AudioRecorder = factory());
})(this, (function () { 'use strict';

	let workerStates = {
	  INACTIVE: 0,
	  LOADING: 1,
	  READY: 2,
	  ERROR: 3
	};
	let worker = null;
	let workerState = workerStates.INACTIVE;
	let workerStateChangeCallbacks = [];
	let jobCallbacks = {};
	function uuidv4() {
	  // https://stackoverflow.com/a/2117523
	  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
	}
	function notifyWorkerState(newState) {
	  workerState = newState;
	  for (let callback of workerStateChangeCallbacks) {
	    callback();
	  }
	  workerStateChangeCallbacks = [];
	}

	// This hack required to load worker from another domain (e.g. a CDN)
	// https://stackoverflow.com/a/62914052
	function getWorkerCrossDomainURL(url) {
	  const content = `importScripts("${url}");`;
	  return URL.createObjectURL(new Blob([content], {
	    type: "text/javascript"
	  }));
	}
	function loadWorker(workerUrl) {
	  if (/^https?:\/\//.test(workerUrl)) {
	    // Is it an absolute URL? Then consider it cross domain.
	    workerUrl = getWorkerCrossDomainURL(workerUrl);
	  }
	  worker = new Worker(workerUrl);
	  workerState = workerStates.LOADING;
	  worker.onmessage = event => {
	    switch (event.data.message) {
	      case "ready":
	        notifyWorkerState(workerStates.READY);
	        break;
	      case "encoded":
	        if (event.data.jobId in jobCallbacks) {
	          jobCallbacks[event.data.jobId].onencoded(event.data.srcBufLen);
	        }
	        break;
	      case "data":
	        if (event.data.jobId in jobCallbacks) {
	          jobCallbacks[event.data.jobId].ondataavailable(event.data.data);
	        }
	        break;
	      case "stopped":
	        if (event.data.jobId in jobCallbacks) {
	          jobCallbacks[event.data.jobId].onstopped();
	        }
	        break;
	    }
	  };
	  worker.onerror = event => {
	    console.error("mp3worker error. Is the worker URL correct?");
	    notifyWorkerState(workerStates.ERROR);
	  };
	}

	// Callbacks:
	// - ondataavailable
	// - onstopped
	class WorkerEncoder {
	  constructor(options) {
	    this.jobId = uuidv4();
	    this.options = options;
	    this.queuedData = 0;
	    jobCallbacks[this.jobId] = {
	      onencoded: srcBufLen => {
	        this.queuedData -= srcBufLen;
	      },
	      ondataavailable: data => {
	        this.ondataavailable && this.ondataavailable(data);
	      },
	      onstopped: () => {
	        delete jobCallbacks[this.jobId]; // Clean up
	        this.onstopped && this.onstopped();
	      }
	    };
	  }
	  static preload(workerUrl) {
	    if (workerState == workerStates.INACTIVE || workerState == workerStates.ERROR) {
	      loadWorker(workerUrl);
	    }
	  }
	  static waitForWorker(workerUrl) {
	    if (workerState == workerStates.READY) {
	      return Promise.resolve();
	    } else {
	      // Worker loading already failed, try again...
	      if (workerState == workerStates.INACTIVE || workerState == workerStates.ERROR) {
	        loadWorker(workerUrl);
	      }
	      return new Promise((resolve, reject) => {
	        workerStateChangeCallbacks.push(() => {
	          if (workerState == workerStates.READY) {
	            resolve();
	          } else {
	            let error = new Error("MP3 worker failed");
	            error.name = "WorkerError";
	            reject(error);
	          }
	        });
	      });
	    }
	  }
	  start() {
	    worker.postMessage({
	      command: "start",
	      jobId: this.jobId,
	      options: this.options
	    });
	  }
	  sendData(buffers) {
	    // Check for an empty buffer
	    if (buffers && buffers.length > 0 && buffers[0].length > 0) {
	      this.queuedData += buffers[0].length;
	      worker.postMessage({
	        command: "data",
	        jobId: this.jobId,
	        buffers: buffers
	      });
	    }
	  }

	  // Amount of data that is not yet encoded.
	  getQueuedDataLen() {
	    return this.queuedData;
	  }
	  stop() {
	    worker.postMessage({
	      command: "stop",
	      jobId: this.jobId
	    });
	  }
	}

	class Timer {
	  constructor() {
	    this.reset();
	  }
	  reset() {
	    this.startTime = null; // May be modified when resuming, so not the true start time.
	    this.stoppedTime = null;
	  }
	  start() {
	    if (!this.startTime) {
	      this.startTime = Date.now();
	    }
	    if (this.stoppedTime) {
	      // Skip time forward by the time length we were stopped
	      this.startTime += Date.now() - this.stoppedTime;
	      this.stoppedTime = null;
	    }
	  }
	  resetAndStart() {
	    this.reset();
	    this.start();
	  }
	  stop() {
	    if (!this.stoppedTime) {
	      this.stoppedTime = Date.now();
	    }
	  }
	  getTime() {
	    if (this.startTime) {
	      if (this.stoppedTime) {
	        return this.stoppedTime - this.startTime;
	      } else {
	        return Date.now() - this.startTime;
	      }
	    } else {
	      return 0;
	    }
	  }
	}

	function stopStream(stream) {
	  if (stream.getTracks) {
	    stream.getTracks().forEach(track => track.stop());
	  } else {
	    stream.stop(); // Deprecated
	  }
	}

	// https://stackoverflow.com/a/9039885
	function detectIOS() {
	  return ['iPad Simulator', 'iPhone Simulator', 'iPod Simulator', 'iPad', 'iPhone', 'iPod'].includes(navigator.platform)
	  // iPad on iOS 13 detection
	  || navigator.userAgent.includes("Mac") && "ontouchend" in document;
	}
	function detectSafari() {
	  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
	}

	function getAudioContextCtor() {
	  return window.AudioContext || window.webkitAudioContext;
	}
	// Don't use audio worklet on iOS or safari, fall back to ScriptProcessor.
	// There are issues with dropped incoming audio data after ~45 seconds. Thus, the resulting audio would be shorter and sped up / glitchy.
	// Curiously, these same issues are present if *not using* AudioWorklet on Chrome
	function isAudioWorkletSupported() {
	  return window.AudioWorklet && !detectIOS() && !detectSafari();
	}
	const states = {
	  STOPPED: 0,
	  RECORDING: 1,
	  PAUSED: 2,
	  STARTING: 3,
	  STOPPING: 4
	};
	const DEFAULT_OPTIONS = {
	  recordingGain: 1,
	  encoderBitRate: 96,
	  streaming: false,
	  streamBufferSize: 50000,
	  forceScriptProcessor: false,
	  constraints: {
	    channelCount: 1,
	    autoGainControl: true,
	    echoCancellation: true,
	    noiseSuppression: true
	  }
	};
	let workerUrl = null;
	function createCancelStartError() {
	  let error = new Error("AudioRecorder start cancelled by call to stop");
	  error.name = "CancelStartError";
	  return error;
	}
	function getNumberOfChannels(stream) {
	  let audioTracks = stream.getAudioTracks();
	  if (audioTracks.length < 1) {
	    throw new Error("No audio tracks in user media stream");
	  }
	  let trackSettings = audioTracks[0].getSettings();
	  return "channelCount" in trackSettings ? trackSettings.channelCount : 1;
	}

	// Worklet does nothing more than pass the data out, to be actually encoded by a regular Web Worker
	// Previously this was rewritten to do the encoding within an AudioWorklet, and it was all very nice and clean
	// but apparently doing anything that uses much CPU in a AudioWorklet will cause glitches in some browsers.
	// So, it's best to do the encoding in a regular Web Worker.
	let AUDIO_OUTPUT_MODULE_URL = null;
	function getAudioOutputModuleUrl() {
	  if (AUDIO_OUTPUT_MODULE_URL) {
	    return AUDIO_OUTPUT_MODULE_URL;
	  }
	  AUDIO_OUTPUT_MODULE_URL = URL.createObjectURL(new Blob([`
		class AudioOutputProcessor extends AudioWorkletProcessor {
			process(inputs, outputs) {
				this.port.postMessage(inputs[0]);
				return true;
			}
		}

		registerProcessor("audio-output-processor", AudioOutputProcessor);
	`], {
	    type: "application/javascript"
	  }));
	  return AUDIO_OUTPUT_MODULE_URL;
	}

	/*
	Callbacks:
		ondataavailable
		onstart - called when recording successfully started
		onstop - called when all data finished encoding and was output
		onerror - error starting recording
	*/
	class AudioRecorder {
	  constructor(options) {
	    this.options = {
	      ...DEFAULT_OPTIONS,
	      ...options
	    };
	    this.state = states.STOPPED;
	    this.audioContext = null;
	    this.encoder = null;
	    this.encodedData = null;
	    this.stopPromiseResolve = null;
	    this.stopPromiseReject = null;
	    this.timer = new Timer();
	  }
	  static isRecordingSupported() {
	    return getAudioContextCtor() && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
	  }
	  static preload(_workerUrl) {
	    workerUrl = _workerUrl;
	    WorkerEncoder.preload(workerUrl);
	  }

	  // Will we use AudioWorklet?
	  useAudioWorklet() {
	    return isAudioWorkletSupported() && !this.options.forceScriptProcessor;
	  }
	  createAndStartEncoder(numberOfChannels) {
	    this.encoder = new WorkerEncoder({
	      originalSampleRate: this.audioContext.sampleRate,
	      numberOfChannels: numberOfChannels,
	      encoderBitRate: this.options.encoderBitRate,
	      streamBufferSize: this.options.streamBufferSize
	    });
	    this.encoder.ondataavailable = data => {
	      if (this.options.streaming) {
	        this.ondataavailable && this.ondataavailable(data);
	      } else {
	        this.encodedData.push(data);
	      }
	    };
	    this.encoder.onstopped = () => {
	      this.state = states.STOPPED;
	      let mp3Blob = this.options.streaming ? undefined : new Blob(this.encodedData, {
	        type: "audio/mpeg"
	      });
	      this.onstop && this.onstop(mp3Blob);
	      this.stopPromiseResolve(mp3Blob);
	    };
	    this.encoder.start();
	  }
	  createOutputNode(numberOfChannels) {
	    if (this.useAudioWorklet()) {
	      console.log("Using AudioWorklet");
	      this.outputNode = new AudioWorkletNode(this.audioContext, "audio-output-processor", {
	        numberOfOutputs: 0
	      });
	      this.outputNode.port.onmessage = _ref => {
	        let {
	          data
	        } = _ref;
	        if (this.state == states.RECORDING) {
	          this.encoder.sendData(data);
	        }
	      };
	    } else {
	      console.log("Using ScriptProcessorNode");
	      this.outputNode = this.audioContext.createScriptProcessor(4096, numberOfChannels, numberOfChannels);
	      this.outputNode.connect(this.audioContext.destination);
	      this.outputNode.onaudioprocess = event => {
	        if (this.state == states.RECORDING) {
	          let inputBuffer = event.inputBuffer;
	          let buffers = [];
	          for (let i = 0; i < inputBuffer.numberOfChannels; i++) {
	            buffers.push(inputBuffer.getChannelData(i));
	          }
	          this.encoder.sendData(buffers);
	        }
	      };
	    }
	  }
	  createAudioNodes(numberOfChannels) {
	    this.createOutputNode(numberOfChannels);
	    this.recordingGainNode = this.audioContext.createGain();
	    this.setRecordingGain(this.options.recordingGain);
	    this.recordingGainNode.connect(this.outputNode);
	    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
	    this.sourceNode.connect(this.recordingGainNode);
	  }
	  cleanupAudioNodes() {
	    if (this.stream) {
	      stopStream(this.stream);
	      this.stream = null;
	    }
	    if (this.useAudioWorklet()) {
	      this.outputNode && (this.outputNode.port.onmessage = null);
	    } else {
	      this.outputNode && (this.outputNode.onaudioprocess = null);
	    }
	    this.outputNode && this.outputNode.disconnect();
	    this.recordingGainNode && this.recordingGainNode.disconnect();
	    this.sourceNode && this.sourceNode.disconnect();
	    this.audioContext && this.audioContext.close();
	  }
	  setRecordingGain(gain) {
	    this.options.recordingGain = gain;
	    if (this.recordingGainNode) {
	      this.recordingGainNode.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);
	    }
	  }
	  get time() {
	    return this.timer.getTime();
	  }

	  // Get the amount of data left to be encoded.
	  // Useful to estimate if STOPPING state (encoding still ongoing) will last a while.
	  getEncodingQueueSize() {
	    return this.encoder ? this.encoder.getQueuedDataLen() : 0;
	  }

	  // Called after every "await" in start(), to check that stop wasn't called
	  // and we should abandon starting
	  stoppingCheck() {
	    if (this.state == states.STOPPING) {
	      throw createCancelStartError();
	    }
	  }
	  async __start(paused) {
	    if (this.state != states.STOPPED) {
	      throw new Error("Called start when not in stopped state");
	    }
	    if (workerUrl == null) {
	      throw new Error("preload was not called on AudioRecorder");
	    }
	    this.state = states.STARTING;
	    this.encodedData = [];
	    this.stream = null;
	    try {
	      await WorkerEncoder.waitForWorker(workerUrl);
	      this.stoppingCheck();

	      // If a constraint is set, pass them, otherwise just pass true
	      let constraints = Object.keys(this.options.constraints).length > 0 ? this.options.constraints : true;
	      this.stream = await navigator.mediaDevices.getUserMedia({
	        audio: constraints
	      });
	      this.stoppingCheck();
	      const _AudioContext = getAudioContextCtor();
	      this.audioContext = new _AudioContext();
	      if (this.useAudioWorklet()) {
	        await this.audioContext.audioWorklet.addModule(getAudioOutputModuleUrl(), {
	          credentials: "omit"
	        });
	        this.stoppingCheck();
	      }

	      // Channel count must be gotten from the stream, as it might not have supported
	      // the desired amount specified in the constraints
	      let numberOfChannels = getNumberOfChannels(this.stream);

	      // Successfully recording!
	      this.createAndStartEncoder(numberOfChannels);
	      this.createAudioNodes(numberOfChannels);
	      if (paused) {
	        this.timer.reset();
	        this.state = states.PAUSED;
	      } else {
	        this.timer.resetAndStart();
	        this.state = states.RECORDING;
	      }
	      this.onstart && this.onstart();
	    } catch (error) {
	      let startWasCancelled = this.state == states.STOPPING;
	      this.cleanupAudioNodes();

	      // Reset so can attempt start again
	      this.state = states.STOPPED;

	      // Reject the stop promise now we have cleaned up and are in STOPPED state and ready to start() again
	      if (startWasCancelled) {
	        this.stopPromiseReject(error);
	      }
	      throw error;
	    }
	  }
	  async __stop() {
	    this.timer.stop();
	    if (this.state == states.RECORDING || this.state == states.PAUSED) {
	      // Stop recording, but encoding may not have finished yet,
	      // so we enter the stopping state.
	      this.state = states.STOPPING;
	      this.cleanupAudioNodes();
	      this.encoder.stop();

	      // Will be resolved later when encoding finishes
	      return new Promise((resolve, reject) => {
	        this.stopPromiseResolve = resolve;
	      });
	    } else if (this.state == states.STARTING) {
	      this.state = states.STOPPING;

	      // Will be rejected later when start() has completely finished operation
	      return new Promise((resolve, reject) => {
	        this.stopPromiseReject = reject;
	      });
	    }
	    throw new Error("Called stop when AudioRecorder was not started");
	  }
	  start() {
	    let paused = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
	    let promise = this.__start(paused);
	    promise.catch(error => {
	      // Don't send CancelStartError to onerror, as it's not *really* an error state
	      // Only used as a promise rejection to indicate that starting did not succeed.
	      if (error.name != "CancelStartError") {
	        this.onerror && this.onerror(error);
	      }
	    });
	    if (!this.onerror) {
	      return promise;
	    }
	  }
	  stop() {
	    let promise = this.__stop();
	    promise.catch(error => {
	      if (error.name == "CancelStartError") {
	        // Stop was called before recording even started
	        // Send a onstop event anyway to indicate that recording can be retried.
	        this.onstop && this.onstop(this.options.streaming ? undefined : null);
	      } else {
	        this.onerror && this.onerror(error);
	      }
	    });
	    if (!this.onerror) {
	      return promise;
	    }
	  }
	  pause() {
	    if (this.state == states.RECORDING) {
	      this.state = states.PAUSED;
	      this.timer.stop();
	    }
	  }
	  resume() {
	    if (this.state == states.PAUSED) {
	      this.state = states.RECORDING;
	      this.timer.start();
	    }
	  }
	}

	return AudioRecorder;

}));
//# sourceMappingURL=audiorecorder.js.map
