
export default class Timer {
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
