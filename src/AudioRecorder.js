import {waitForAudioWorkletNodeShim, createAudioWorkletNodeShim} from "./mp3worker/AudioWorkletNodeShim.js";
import {stopStream, detectIOS, detectSafari} from "./utils.js";

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
	numberOfChannels : 1,
	encoderBitRate : 96,
	streaming : false,
	streamBufferSize : 50000,
	forceScriptProcessor : false,
	constraints : {}
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

/*
Callbacks:
	ondataavailable
	onstart - called when recording successfully started
	onstop - called when all data finished encoding and was output
*/
export default class AudioRecorder {
	constructor(options) {
		this.options = {
			...DEFAULT_OPTIONS,
			...options
		};

		this.state = states.STOPPED;
		this.cancelStartCallback = null;
		this.encoder = null;
		this.encodedData = null;
	}
	
	static isRecordingSupported() {
		return AudioContext && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
	}
	
	static preload(options) {
		preloadWorkers(options);
	}

	// Stream must be created before calling
	async createEncoderWorklet() {
		if (useAudioWorklet && !this.options.forceScriptProcessor) {
			console.log("Using AudioWorklet");
			await loadWorklet();
			
			this.encoderWorkletNode = new AudioWorkletNode(audioContext, "mp3-encoder-processor", {
				numberOfInputs : 1,
				numberOfOutputs : 0,
				processorOptions : {
					originalSampleRate : audioContext.sampleRate,
					numberOfChannels : this.options.numberOfChannels,
					encoderBitRate : this.options.encoderBitRate,
					streamBufferSize : this.options.streamBufferSize
				}
			});
		} else {
			console.log("Using ScriptProcessorNode");
			await loadWorker();
			
			this.encoderWorkletNode = createAudioWorkletNodeShim(audioContext, {
				originalSampleRate : audioContext.sampleRate,
				numberOfChannels : this.options.numberOfChannels,
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
					// Encoding has finished. Can cleap up audio context etc
					this.cleanup();
					this.state = states.STOPPED;
					this.onstop && this.onstop(
						this.options.streaming ? undefined : new Blob(this.encodedData, {type : "audio/mpeg"})
					);
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

	start() {
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

		let cancelStart = false;

		// If cancelStart is set, we should abandon everything and not alter any local state,
		// since recording may have been retried already.
		this.cancelStartCallback = () => {
			cancelStart = true;
		};

		this.createEncoderWorklet().then(() => {
			if (cancelStart) {
				this.cleanup();
				return;
			}

			// If a constraint is set, pass them, otherwise just pass true
			let constraints = Object.keys(this.options.constraints).length > 0 ? this.options.constraints : true;

			return navigator.mediaDevices.getUserMedia({audio : constraints})
				.then((stream) => {
					if (cancelStart) {
						stopStream(stream);
						this.cleanup();
						return;
					}

					// Successfully recording!
					this.stream = stream;
					this.connectAudioNodes();
					
					this.state = states.RECORDING;
					this.onstart && this.onstart({sampleRate : audioContext.sampleRate});
				});
		}).catch((error) => {
			if (cancelStart) {
				this.cleanup();
				return;
			}

			this.state = states.STOPPED;
			this.onerror && this.onerror(error);
		});
	}

	stop() {
		if (this.state == states.RECORDING || this.state == states.PAUSED) {
			this.state = states.STOPPING;
			// Stop recording, but don't destroy actual audio context until all encoding has finished.
			stopStream(this.stream);
			this.encoderWorkletNode.port.postMessage({message : "stop_encoding"});
		} else if (this.state == states.STARTING) {
			this.cancelStartCallback && this.cancelStartCallback();
			this.cancelStartCallback = null;
			this.state = states.STOPPED;
		}
	}

	pause() {
		if (this.state == states.RECORDING) {
			this.encoderWorkletNode.port.postMessage({message : "pause"});
			this.state = states.PAUSED;
		}
	}

	resume() {
		if (this.state == states.PAUSED) {
			this.encoderWorkletNode.port.postMessage({message : "resume"});
			this.state = states.RECORDING;
		}
	}
}
