//import { promises as fsPromises } from 'fs';
import http from 'http';

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

//const FILENAME = 'geiger.csv';
const DEVICE = '/dev/ttyUSB0';

const host = '0.0.0.0';
const port = 8080;

//let filehandle;
let lastData;
let level;

// try {
// 	filehandle = await fsPromises.open(FILENAME, 'a', );
// } catch (err) {
// 	console.error(err);
// 	process.exit(1);
// }

const serialPort = new SerialPort({
	path: DEVICE,
	baudRate: 9600
});

function parseData(data) {
	const values = data.split(',');
	return {
		timestamp: (new Date()).toISOString(),
		value: parseFloat(values[5]),
		unit: 'µSv/h'
	}
}

const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }))
parser.on('data', async data => {
	if (data === lastData) {
		return;
	} else {
		lastData = data;
	}

	level = parseData(data);

	const timestamp = (new Date()).toISOString();
	const line = `${timestamp}, ${data}\r\n`;
	console.log(`${timestamp}, ${data}`);
	//await fsPromises.appendFile(filehandle, line);
});

const server = http.createServer((req, res) => {
	res.writeHead(200, {
		'Content-Type': 'text/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS'
	});
	res.end(JSON.stringify(level, null, 2));
});

server.listen(port, host, () => {
	console.log(`Server is running on http://${host}:${port}`);
});