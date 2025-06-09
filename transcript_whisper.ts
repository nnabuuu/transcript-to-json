import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function run() {
    const filePath = './demo/audio.mp4'; // 你的 audio 文件名
    const fileStream = fs.createReadStream(filePath);

    console.log('🚀 Uploading audio to Whisper API...');

    const transcription = await openai.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-1',
        response_format: 'text' // 你也可以用 'json' 得到更结构化的
    });

    console.log('✅ Transcription done, saving to transcript.txt...');

    fs.writeFileSync('./transcript.txt', transcription, 'utf-8');

    console.log('✅ Saved to transcript.txt');
}

run();
