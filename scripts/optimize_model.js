import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, '../public/data/model_data.json');
const OUTPUT_META = path.join(__dirname, '../public/data/model_metadata.json');
const OUTPUT_BIN = path.join(__dirname, '../public/data/model_vectors.bin');

console.log("Reading JSON model...");
const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
const data = JSON.parse(rawData);

console.log(`Loaded ${data.titles.length} items.`);

// 1. Extract Metadata
const metadata = {
    titles: data.titles,
    norms: data.norms,
    vectorSize: data.vectors[0].length
};

// 2. Convert Vectors to Flat Float32Array
const vectorSize = metadata.vectorSize;
const numItems = data.vectors.length;
const floatArray = new Float32Array(numItems * vectorSize);

console.log(`Converting ${numItems} vectors of size ${vectorSize}...`);

for (let i = 0; i < numItems; i++) {
    const vec = data.vectors[i];
    for (let j = 0; j < vectorSize; j++) {
        floatArray[i * vectorSize + j] = vec[j];
    }
}

// 3. Write Files
console.log("Writing metadata...");
fs.writeFileSync(OUTPUT_META, JSON.stringify(metadata));

console.log("Writing binary vectors...");
fs.writeFileSync(OUTPUT_BIN, Buffer.from(floatArray.buffer));

console.log("Done!");
console.log(`Original JSON: ${(fs.statSync(INPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`New Metadata: ${(fs.statSync(OUTPUT_META).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`New Binary: ${(fs.statSync(OUTPUT_BIN).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`Total New: ${((fs.statSync(OUTPUT_META).size + fs.statSync(OUTPUT_BIN).size) / 1024 / 1024).toFixed(2)} MB`);
