// Use the deprecated ScriptProcessorNode and a standard web worker to do the encoding

import WorkerEncoder from "./WorkerEncoder.js";

// Trigger a preload of the worker, but don't wait for it.
export function preloadAudioWorkletNodeShim(workerUrl) {
	WorkerEncoder.preload(workerUrl);
}

// Load the worker (if not already loaded) and wait for it.
export function waitForAudioWorkletNodeShim(workerUrl) {
	return WorkerEncoder.waitForWorker(workerUrl);
}

export function createAudioWorkletNodeShim(context, options) {
	let stopped = false;
	let scriptProcessorNode = context.createScriptProcessor(4096, options.numberOfChannels, options.numberOfChannels);
	
	scriptProcessorNode.connect(context.destination);
	
	let encoder = new WorkerEncoder({
		originalSampleRate : options.originalSampleRate,
		numberOfChannels : options.numberOfChannels,
		encoderBitRate : options.encoderBitRate,
		streamBufferSize : options.streamBufferSize
	});
	
	// A fake MessagePort
	scriptProcessorNode.port = {
		onmessage : null,
		
		postMessage : (data) => {
			switch (data.message) {
				case "stop_encoding":
					encoder.stop();
					stopped = true;
					break;
			}
		}
	};

	encoder.ondataavailable = (data) => {
		scriptProcessorNode.port.onmessage && scriptProcessorNode.port.onmessage({data : {
			message : "data",
			data : data
		}});
	};

	encoder.onstopped = () => {
		scriptProcessorNode.port.onmessage && scriptProcessorNode.port.onmessage({data : {
			message : "stopped"
		}});
	};

	encoder.start();
	
	scriptProcessorNode.onaudioprocess = (event) => {
		// seems like script processor still receives data even after the stream
		// has stopped, so we need check for "stopped" here.
		if (!stopped) {
			let inputBuffer = event.inputBuffer;
			let buffers = [];

			for (let i = 0; i < inputBuffer.numberOfChannels; i ++) {
				buffers.push(inputBuffer.getChannelData(i));
			}

			encoder.sendData(buffers);
		}
	};
	
	return scriptProcessorNode;
}
