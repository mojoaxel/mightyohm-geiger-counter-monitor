import http from 'http';

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { JoyItLCD } from 'joy-it-rb-lcd-20x4';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';

dayjs.extend(relativeTime)

const LCD_LINES = 4;
const LCD_WIDTH = 20;

const DEVICE = '/dev/ttyUSB0';

const host = '0.0.0.0';
const port = 8080;

let startupDate = dayjs();
let lcd;
let server;
let serialPort;
let lastData;
let level;
let min = Infinity;
let max = 0;
let average;

async function die(err, msg = 'Unknown error') {
	await lcd.close();
	await lcd.clear();
	//await lcs.close();
	serialPort.close();
	server.close();
	if (err) {
		console.error(msg, err);
		process.exit(1);
	} else {
		process.exit(0);
	}
}

function parseData(data) {
	const values = data.split(',');
	return {
		timestamp: (new Date()).toISOString(),
		value: parseFloat(values[5]),
		unit: 'µSv/h'
	}
}

async function handleGeigerData(data) {
	if (data === lastData) {
		return;
	} else {
		lastData = data;
	}

	level = parseData(data);

	if (level.value < min) {
		min = level.value;
	}
	if (level.value > max) {
		max = level.value;
	}
	if (!average) {
		average = level.value
	} else {
		average = (average*19 + level.value)/20;
	}

	const timestamp = (new Date()).toISOString();
	console.log(`${timestamp}, ${data}`);

	await updateDisplay();
}

async function initGeigerCounter() {
	try {
		serialPort = new SerialPort({
			path: DEVICE,
			baudRate: 9600
		});
		
		const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }))
		parser.on('data', handleGeigerData);
	} catch(err) {
		await die(err);
	}
}

async function updateDisplay() {
	const timestamp = dayjs(level.timestamp);
	const lines = [
		`Up for ${dayjs(timestamp).from(startupDate, true)}`.padStart(LCD_WIDTH).substring(0, LCD_WIDTH),
		`Current:` + `${level.value.toFixed(2)} uSv/h`.padStart(LCD_WIDTH-8).substring(0, LCD_WIDTH),
		`Average:` + `${average.toFixed(2)} uSv/h`.padStart(LCD_WIDTH-8),
		`Min:` + min.toFixed(2).padStart(LCD_WIDTH/2-5) + `  Max:` + max.toFixed(2).padStart(LCD_WIDTH/2-5)
	];
	try {
		await lcd.printLines(lines);
	} catch(err) {
		await die(err, "Error updating LCD display");
	}
}

async function initLCD() {
	try {
		lcd = new JoyItLCD({
			width: LCD_WIDTH,
			height: LCD_LINES
		});
		await lcd.initialize();
		await lcd.clear();
	} catch(err) {
		await die(err, "Error initializing LCD");
	}
}

async function initServer() {
	try {
		server = http.createServer((req, res) => {
			res.writeHead(200, {
				'Content-Type': 'text/json',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, OPTIONS'
			});
			res.end(JSON.stringify(level, null, 2));
		});
		
		return new Promise((resolve, _reject) => {
			server.listen(port, host, () => {
				console.log(`Server is running on http://${host}:${port}`);
				resolve();
			});
		});
	} catch(err) {
		await die(err, "Error starting webserver");
	}
}

(async () => {
	await initLCD();
	await initGeigerCounter();
	await initServer();

	// close connections before restarting with nodemon
	['SIGUSR2'].forEach(signal => {
		process.on(signal, async () => {
			await die();
		})
	})
})();