let workerStates = {
	INACTIVE : 0,
	LOADING : 1,
	READY : 2,
	ERROR : 3
}

let worker = null;
let workerState = workerStates.INACTIVE;
let workerStateChangeCallbacks = [];
let jobCallbacks = {};

function uuidv4() { // https://stackoverflow.com/a/2117523
	return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
		(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
	);
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
	return URL.createObjectURL(new Blob([content], {type : "text/javascript"}));
}

function loadWorker(workerUrl) {
	if (/^https?:\/\//.test(workerUrl)) { // Is it an absolute URL? Then consider it cross domain.
		workerUrl = getWorkerCrossDomainURL(workerUrl);
	}

	worker = new Worker(workerUrl);
	workerState = workerStates.LOADING;

	worker.onmessage = (event) => {
		switch (event.data.message) {
			case "ready":
				notifyWorkerState(workerStates.READY);
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

	worker.onerror = (event) => {
		console.error("mp3worker error event", event);
		notifyWorkerState(workerStates.ERROR);
	};
}

// Callbacks:
// - ondataavailable
// - onstopped
export default class WorkerEncoder {
	constructor(options) {
		this.jobId = uuidv4();
		this.options = options;

		jobCallbacks[this.jobId] = {
			ondataavailable : (data) => {
				this.ondataavailable && this.ondataavailable(data);
			},
			onstopped : () => {
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
			command : "start",
			jobId : this.jobId,
			options : this.options
		});
	}

	sendData(buffers) {
		worker.postMessage({
			command : "data",
			jobId : this.jobId,
			buffers : buffers
		});
	}

	stop() {
		worker.postMessage({
			command : "stop",
			jobId : this.jobId
		});
	}
}
