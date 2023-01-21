
class RawPassthroughProcessor extends AudioWorkletProcessor {
	constructor(opts) {
		super();
		
		this.port.onmessage = ({data}) => {
			switch (data.message) {
				case "stop_encoding":
					this.port.postMessage({message : "stopped"});
					break;
			}
		};
	}
	
	process(inputs, outputs) {
		if (inputs && inputs.length > 0 && inputs[0].length > 0) {
			this.port.postMessage({message : "data", data : inputs[0][0]}, [inputs[0][0].buffer]);
		}
		return true;
	}
}

registerProcessor("mp3-encoder-processor", RawPassthroughProcessor);
