import lamejs from "lamejstmp";

function floatTo16BitPCM(input, output) {
	for (let i = 0; i < input.length; i ++) {
		let s = Math.max(-1, Math.min(1, input[i]));
		output[i] = (s < 0 ? s * 0x8000 : s * 0x7FFF);
	}
};

function convertBufferTo16Bit(arrayBuffer){
	let data = new Float32Array(arrayBuffer);
	let out = new Int16Array(arrayBuffer.length);
	floatTo16BitPCM(data, out);
	return out;
};

/*
Wrapper for lamejs that buffers the output into larger chunks according to streamBufferSize.

Callbacks:
	onencodeddata - called with chunks of encoded data, every time streamBufferSize amount of data is ready
*/
export default class MP3Encoder {
	constructor(options) {
		this.options = {
			numberOfChannels : 1,
			originalSampleRate : 44100,
			encoderBitRate : 96,
			streamBufferSize : 50000, // buffer this amount of encoded data before generating a data event
			...options
		};

		this.encodedBuffer = new Int8Array(this.options.streamBufferSize);
		this.encodedBufferUsed = 0;

		this.lameEncoder = new lamejs.Mp3Encoder(
			this.options.numberOfChannels,
			this.options.originalSampleRate,
			this.options.encoderBitRate
		);
		
		this.onencodeddata = null;
	}

	encode(buffers) {
		// maximum of two channels, left and right. Any more are ignored.
		let numChannels = Math.min(this.options.numberOfChannels, 2);
		let buffers16bit = new Array(numChannels);

		for (let i = 0; i < numChannels; i ++) {
			buffers16bit[i] = convertBufferTo16Bit(buffers[i]);
		}

		let encodedData = null;

		if (numChannels > 1) {
			encodedData = this.lameEncoder.encodeBuffer(buffers16bit[0], buffers16bit[1]);
		} else {
			encodedData = this.lameEncoder.encodeBuffer(buffers16bit[0]);
		}

		this.handleEncodedData(encodedData);
	}

	finishEncoding() {
		let lastData = this.lameEncoder.flush();

		if (lastData.length > 0) {
			this.handleEncodedData(lastData);
		}

		this.streamAllFromBuffer();
	};

	handleEncodedData(data) {
		if (data.length > 0) {
			let dataRemaining = data.length;
			let dataIndex = 0;

			while (dataRemaining > 0) {
				let spaceInBuffer = this.options.streamBufferSize - this.encodedBufferUsed;
				let amountToCopy = Math.min(spaceInBuffer, dataRemaining);
				let dataToCopy = data.subarray(dataIndex, dataIndex + amountToCopy);

				this.encodedBuffer.set(dataToCopy, this.encodedBufferUsed);
				this.encodedBufferUsed += amountToCopy;

				dataIndex += amountToCopy;
				dataRemaining -= amountToCopy;

				if (this.encodedBufferUsed >= this.options.streamBufferSize) {
					this.streamAllFromBuffer();
				}
			}
		}
	}

	streamAllFromBuffer() {
		if (this.encodedBufferUsed > 0) {
			this.onencodeddata && this.onencodeddata(new Int8Array(this.encodedBuffer.subarray(0, this.encodedBufferUsed)));
			this.encodedBufferUsed = 0;
		}
	}
}
