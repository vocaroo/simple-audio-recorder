import {waitForAudioWorkletNodeShim, createAudioWorkletNodeShim} from "./mp3worker/AudioWorkletNodeShim.js";
import {stopStream, detectIOS, detectSafari} from "./utils.js";
import Timer from "./Timer.js";

const AudioContext = window.AudioContext || window.webkitAudioContext;
// Don't use audio worklet on iOS or safari, fall back to ScriptProcessor (via AudioWorkletNodeShim)
// There are issues with dropped incoming audio data after ~45 seconds. Thus, the resulting audio would be shorter and sped up / glitchy.
// Curiously, these same issues are present if *not using* AudioWorklet on Chrome
const useAudioWorklet = window.AudioWorklet && !detectIOS() && !detectSafari();

const states = {
	STOPPED : 0,
	RECORDING : 1,
	PAUSED : 2,
	STARTING : 3,
	STOPPING : 4
};

const DEFAULT_OPTIONS = {
	recordingGain : 1,
	encoderBitRate : 96,
	streaming : false,
	streamBufferSize : 50000,
	forceScriptProcessor : false,
	constraints : {
		channelCount : 1,
		autoGainControl : true,
		echoCancellation : true,
		noiseSuppression : true
	}
};

const DEFAULT_PRELOAD_OPTIONS = {
	workletUrl : "./mp3worklet.js",
	workerUrl : "./mp3worker.js",
	preloadBoth : false
};

// We use a single global AudioContext for all audiorecorders so we only load the AudioWorklet once (and can preload it)
let audioContext = new AudioContext();
let preloadOptions = null;
let workletPromise = null;
let workerPromise = null;

function loadWorklet() {
	if (workletPromise == null) {
		workletPromise = audioContext.audioWorklet.addModule(preloadOptions.workletUrl);
		
		workletPromise.catch(error => { // Reset so it can be tried again if user presses to record again
			workletPromise = null;
		});
	}
	
	return workletPromise;
}

function loadWorker() {
	if (workerPromise == null) {
		workerPromise = waitForAudioWorkletNodeShim(preloadOptions.workerUrl);
		
		workerPromise.catch(error => { // Reset so it can be tried again if user presses to record again
			workerPromise = null;
		});
	}
	
	return workerPromise;
}

function preloadWorkers(options) {
	preloadOptions = {
		...DEFAULT_PRELOAD_OPTIONS,
		...options
	};
	
	if (options.preloadBoth) {
		loadWorklet();
		loadWorker();
	} else {
		if (useAudioWorklet) {
			loadWorklet();
		} else {
			loadWorker();
		}
	}
}

function createCancelStartError() {
	let error = new Error("AudioRecorder start cancelled by call to stop");
	error.name = "CancelStartError";
	return error;
}

function createWorkerLoadError() {
	let error = new Error("Failed to load worklet or worker");
	error.name = "WorkerError";
	return error;
}

/*
Callbacks:
	ondataavailable
	onstart - called when recording successfully started
	onstop - called when all data finished encoding and was output
	onerror - error starting recording
*/
export default class AudioRecorder {
	constructor(options) {
		this.options = {
			...DEFAULT_OPTIONS,
			...options
		};

		this.state = states.STOPPED;
		this.encoder = null;
		this.encodedData = null;
		this.stopPromiseResolve = null;
		this.stopPromiseReject = null;
		this.timer = new Timer();
	}
	
	static isRecordingSupported() {
		return AudioContext && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
	}
	
	static preload(options) {
		preloadWorkers(options);
	}
	
	// useAudioWorklet may be set... But will we REALLY use it?
	reallyUseAudioWorklet() {
		return useAudioWorklet && !this.options.forceScriptProcessor;
	}
	
	async tryLoadWorklet() {
		let loadFunc = this.reallyUseAudioWorklet() ? loadWorklet : loadWorker;
		
		try {
			await loadFunc();
		} catch (error) {
			throw createWorkerLoadError();
		}
	}

	createEncoderWorklet(trackSettings) {
		let numberOfChannels = "channelCount" in trackSettings ? trackSettings.channelCount : 1;
		
		if (this.reallyUseAudioWorklet()) {
			console.log("Using AudioWorklet");
			
			this.encoderWorkletNode = new AudioWorkletNode(audioContext, "mp3-encoder-processor", {
				numberOfInputs : 1,
				numberOfOutputs : 0,
				processorOptions : {
					originalSampleRate : audioContext.sampleRate,
					numberOfChannels : numberOfChannels,
					encoderBitRate : this.options.encoderBitRate,
					streamBufferSize : this.options.streamBufferSize
				}
			});
		} else {
			console.log("Using ScriptProcessorNode");
			
			this.encoderWorkletNode = createAudioWorkletNodeShim(audioContext, {
				originalSampleRate : audioContext.sampleRate,
				numberOfChannels : numberOfChannels,
				encoderBitRate : this.options.encoderBitRate,
				streamBufferSize : this.options.streamBufferSize
			});
		}
		
		this.encoderWorkletNode.port.onmessage = ({data}) => {
			switch (data.message) {
				case "data":
					if (this.options.streaming) {
						this.ondataavailable && this.ondataavailable(data.data);
					} else {
						this.encodedData.push(data.data);
					}
					break;
				case "stopped":
					// Encoding has finished. Can clean up some things
					this.cleanup();
					this.state = states.STOPPED;
					let mp3Blob = this.options.streaming ? undefined : new Blob(this.encodedData, {type : "audio/mpeg"});
					this.onstop && this.onstop(mp3Blob);
					this.stopPromiseResolve(mp3Blob);
					break;
			}
		};
	}
	
	connectAudioNodes() {
		this.recordingGainNode = audioContext.createGain();
		this.setRecordingGain(this.options.recordingGain);
		this.recordingGainNode.connect(this.encoderWorkletNode);

		this.sourceNode = audioContext.createMediaStreamSource(this.stream);
		this.sourceNode.connect(this.recordingGainNode);
	}

	cleanup() {
		this.encoderWorkletNode && (this.encoderWorkletNode.port.onmessage = null);
		this.encoderWorkletNode && this.encoderWorkletNode.disconnect();
		this.recordingGainNode && this.recordingGainNode.disconnect();
		this.sourceNode && this.sourceNode.disconnect();
		this.stream && delete this.stream;
	}

	setRecordingGain(gain) {
		this.options.recordingGain = gain;

		if (this.recordingGainNode) {
			this.recordingGainNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);
		}
	}
	
	get time() {
		return this.timer.getTime();
	}

	async __start() {
		if (this.state != states.STOPPED) {
			throw new Error("Called start when not in stopped state");
		}
		
		if (preloadOptions == null) {
			throw new Error("preload was not called on AudioRecorder");
		}
		
		// Chrome will keep the audio context in a suspended state until there is user interaction
		if (audioContext.state == "suspended") {
			audioContext.resume();
		}
		
		this.state = states.STARTING;
		this.encodedData = [];
		
		try {
			await this.tryLoadWorklet();
			
			if (this.state == states.STOPPING) {
				throw createCancelStartError();
			}
			
			// If a constraint is set, pass them, otherwise just pass true
			let constraints = Object.keys(this.options.constraints).length > 0 ? this.options.constraints : true;
			
			let stream = await navigator.mediaDevices.getUserMedia({audio : constraints});
			
			if (this.state == states.STOPPING) {
				stopStream(stream);
				throw createCancelStartError();
			}
			
			let audioTracks = stream.getAudioTracks();
			
			if (audioTracks.length < 1) {
				throw new Error("No audio tracks in user media stream");
			}
			
			this.createEncoderWorklet(audioTracks[0].getSettings());
			
			// Successfully recording!
			this.stream = stream;
			this.connectAudioNodes();
			this.timer.resetAndStart();
			
			this.state = states.RECORDING;
			this.onstart && this.onstart();
		} catch (error) {
			let startWasCancelled = this.state == states.STOPPING;
			this.cleanup();
			
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
			this.state = states.STOPPING;
			// Stop recording, but encoding may not have finished yet.
			stopStream(this.stream);
			this.encoderWorkletNode.port.postMessage({message : "stop_encoding"});
			
			// Will be resolved later when encoding finishes
			return new Promise((resolve, reject) => {
				this.stopPromiseResolve = resolve;
			});
		} else if (this.state == states.STARTING) {
			this.state = states.STOPPING;
			
			// Will be rejected later when start() has completely finished operation
			return new Promise((resolve, reject) => {
				this.stopPromiseReject = reject;
			})
		}
		
		throw new Error("Called stop when AudioRecorder was not started");
	}
	
	start() {
		let promise = this.__start();
		
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
			this.encoderWorkletNode.port.postMessage({message : "pause"});
			this.state = states.PAUSED;
			this.timer.stop();
		}
	}

	resume() {
		if (this.state == states.PAUSED) {
			this.encoderWorkletNode.port.postMessage({message : "resume"});
			this.state = states.RECORDING;
			this.timer.start();
		}
	}
}
