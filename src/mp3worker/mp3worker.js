"use strict";

import lamejs from "lamejstmp";

var encoders = {};

postMessage({message : "ready"});

onmessage = function(event) {
	switch(event.data.command) {
		case "start":
			encoders[event.data.jobId] = new MP3Encoder(event.data.jobId, event.data.options);
			break;
		case "data":
			encoders[event.data.jobId].encode(event.data.buffers);
			break;
		case "stop":
			encoders[event.data.jobId].finishEncoding();
			postMessage({jobId : event.data.jobId, message : "stopped"});
			delete encoders[event.data.jobId];
			break;
	}
}

var MP3Encoder = function(jobId, options) {
	this.jobId = jobId;

	this.options = Object.assign({
		numberOfChannels : 1,
		originalSampleRate : 44100,
		encoderBitRate : 96,
		streamBufferSize : 50000 // buffer this amount of encoded data before generating a data event
	}, options);

	this.encodedBuffer = new Int8Array(this.options.streamBufferSize);
	this.encodedBufferUsed = 0;

	this.lameEncoder = new lamejs.Mp3Encoder(
		this.options.numberOfChannels,
		this.options.originalSampleRate,
		this.options.encoderBitRate
	);
};

MP3Encoder.prototype.encode = function(buffers) {
	// maximum of two channels, left and right. Any more are ignored.
	var numChannels = Math.min(this.options.numberOfChannels, 2);
	var buffers16bit = new Array(numChannels);

	for (var i = 0; i < numChannels; i ++) {
		buffers16bit[i] = this.convertBuffer(buffers[i]);
	}

	var encodedData = null;

	if (numChannels > 1) {
		encodedData = this.lameEncoder.encodeBuffer(buffers16bit[0], buffers16bit[1]);
	} else {
		encodedData = this.lameEncoder.encodeBuffer(buffers16bit[0]);
	}

	this.handleEncodedData(encodedData);
};

MP3Encoder.prototype.finishEncoding = function() {
	var lastData = this.lameEncoder.flush();

	if (lastData.length > 0) {
		this.handleEncodedData(lastData);
	}

	this.streamAllFromBuffer();
};

MP3Encoder.prototype.handleEncodedData = function(data) {
	if (data.length > 0) {
		var dataRemaining = data.length;
		var dataIndex = 0;

		while (dataRemaining > 0) {
			var spaceInBuffer = this.options.streamBufferSize - this.encodedBufferUsed;
			var amountToCopy = Math.min(spaceInBuffer, dataRemaining);
			var dataToCopy = data.subarray(dataIndex, dataIndex + amountToCopy);

			this.encodedBuffer.set(dataToCopy, this.encodedBufferUsed);
			this.encodedBufferUsed += amountToCopy;

			dataIndex += amountToCopy;
			dataRemaining -= amountToCopy;

			if (this.encodedBufferUsed >= this.options.streamBufferSize) {
				this.streamAllFromBuffer();
			}
		}
	}
};

MP3Encoder.prototype.streamAllFromBuffer = function() {
	if (this.encodedBufferUsed > 0) {
		var data = new Int8Array(this.encodedBuffer.subarray(0, this.encodedBufferUsed));
		postMessage({jobId : this.jobId, message : "data", data : data}, [data.buffer]);
		this.encodedBufferUsed = 0;
	}
};

MP3Encoder.prototype.floatTo16BitPCM = function(input, output) {
	for (var i = 0; i < input.length; i ++) {
		var s = Math.max(-1, Math.min(1, input[i]));
		output[i] = (s < 0 ? s * 0x8000 : s * 0x7FFF);
	}
};

MP3Encoder.prototype.convertBuffer = function(arrayBuffer){
	var data = new Float32Array(arrayBuffer);
	var out = new Int16Array(arrayBuffer.length);
	this.floatTo16BitPCM(data, out);
	return out;
};
