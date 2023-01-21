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

/*
Callbacks:
	ondataavailable
	onstart - called when recording successfully started
	onstop - called when all data finished encoding and was output
*/
export default class AudioRecorder {
	constructor(options) {
		this.options = {
			workletUrl : "./mp3worklet.js",
			workerUrl : "./mp3worker.js",
			recordingGain : 1,
			numberOfChannels : 1,
			encoderBitRate : 96,
			streamBufferSize : 50000,
			forceScriptProcessor : false,
			constraints : {},
			...options
		};

		this.state = states.STOPPED;
		this.cancelStartCallback = null;
		this.encoder = null;
	}

	// Stream must be created before calling
	async createAudioContext() {
		this.audioContext = new AudioContext();

		if (useAudioWorklet && !this.options.forceScriptProcessor) {
			console.log("Using AudioWorklet");
			
			await this.audioContext.audioWorklet.addModule(this.options.workletUrl);
			
			this.encoderWorkletNode = new AudioWorkletNode(this.audioContext, "mp3-encoder-processor", {
				numberOfInputs : 1,
				numberOfOutputs : 0,
				processorOptions : {
					originalSampleRate : this.audioContext.sampleRate,
					numberOfChannels : this.options.numberOfChannels,
					encoderBitRate : this.options.encoderBitRate,
					streamBufferSize : this.options.streamBufferSize
				}
			});
		} else {
			console.log("Using ScriptProcessorNode");
			await waitForAudioWorkletNodeShim(this.options.workerUrl);
			
			this.encoderWorkletNode = createAudioWorkletNodeShim(this.audioContext, {
				originalSampleRate : this.audioContext.sampleRate,
				numberOfChannels : this.options.numberOfChannels,
				encoderBitRate : this.options.encoderBitRate,
				streamBufferSize : this.options.streamBufferSize
			});
		}
		
		this.encoderWorkletNode.port.onmessage = ({data}) => {
			switch (data.message) {
				case "data":
					this.ondataavailable && this.ondataavailable(data.data);
					break;
				case "stopped":
					// Encoding has finished. Can cleap up audio context etc
					this.cleanup();
					this.state = states.STOPPED;
					this.onstop && this.onstop();
					break;
			}
		};
	}
	
	connectAudioNodes() {
		this.recordingGainNode = this.audioContext.createGain();
		this.setRecordingGain(this.options.recordingGain);
		this.recordingGainNode.connect(this.encoderWorkletNode);

		this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
		this.sourceNode.connect(this.recordingGainNode);
	}

	cleanup() {
		this.encoderWorkletNode && (this.encoderWorkletNode.port.onmessage = null);
		this.encoderWorkletNode && this.encoderWorkletNode.disconnect();
		this.recordingGainNode && this.recordingGainNode.disconnect();
		this.sourceNode && this.sourceNode.disconnect();
		this.audioContext && this.audioContext.close();
		this.audioContext && delete this.audioContext;
		this.stream && delete this.stream;
	}

	setRecordingGain(gain) {
		this.options.recordingGain = gain;

		if (this.recordingGainNode) {
			this.recordingGainNode.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);
		}
	}

	start() {
		if (this.state != states.STOPPED) {
			throw new Error("Called start when not in stopped state");
		}
		
		this.state = states.STARTING;

		let cancelStart = false;

		// If cancelStart is set, we should abandon everything and not alter any local state,
		// since recording may have been retried already.
		this.cancelStartCallback = () => {
			cancelStart = true;
		};

		this.createAudioContext().then(() => {
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
					this.onstart && this.onstart({sampleRate : this.audioContext.sampleRate});
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
			//this.sourceNode.disconnect();
			this.audioContext.suspend();
			this.state = states.PAUSED;
		}
	}

	resume() {
		if (this.state == states.PAUSED) {
			//this.sourceNode.connect(this.recordingGainNode);
			this.audioContext.resume();
			this.state = states.RECORDING;
		}
	}
}
