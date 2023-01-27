import MP3Encoder from "./MP3Encoder.js";

class MP3EncoderProcessor extends AudioWorkletProcessor {
	constructor(options) {
		super();
		
		this.paused = false;
		this.encoder = new MP3Encoder(options.processorOptions);
		
		this.encoder.onencodeddata = (data) => {
			this.port.postMessage({message : "data", data : data}, [data.buffer]);
		};
		
		this.port.onmessage = ({data}) => {
			switch (data.message) {
				case "stop_encoding":
					this.encoder.finishEncoding();
					this.port.postMessage({message : "stopped"});
					break;
				case "pause":
					this.paused = true;
					break;
				case "resume":
					this.paused = false;
					break;
			}
		};
	}
	
	process(inputs, outputs) {
		if (inputs && inputs.length > 0 && inputs[0].length > 0 && !this.paused) {
			this.encoder.encode(inputs[0]);
		}
		return true;
	}
}

registerProcessor("mp3-encoder-processor", MP3EncoderProcessor);
