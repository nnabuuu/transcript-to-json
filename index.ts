import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const modelName = process.env.MODEL || 'gpt-4o';
const batchSize = parseInt(process.env.BATCH_SIZE || '100', 10);

const promptTemplate = `
你是一个转录优化助手，帮助我修正语音转文字中的错误，并推断每句话的说话人角色比例。

我会给你一段转录文本，格式如下：

时间段（start - end）: 原文字

请你做以下事情：
1️⃣ 修正原文中的识别错误（例如同音字、术语错误、重复词等），使其通顺、符合正常口语。
2️⃣ 不改变时间段（start - end），保留原时间段。
3️⃣ 推断该句子是由 教师 或 学生 说出的，并以百分比形式标注 teacher 和 student 比例（比例和为1）。
4️⃣ 最终以 **严格的JSON数组格式**输出，每一项包含：
    - start
    - end
    - text （修正后的文字）
    - speaker_probabilities （包含 teacher 和 student）

⚠️ 只输出 JSON，不要输出解释说明。

示例格式：

[
  {
    "start": 0.0,
    "end": 4.0,
    "text": "同学们,我们生活在一个充满声音和光的世界里",
    "speaker_probabilities": {
      "teacher": 1.0,
      "student": 0.0
    }
  },
  ...
]

下面是我要处理的 transcript （你每次只处理不超过100条）：
<<<TRANSCRIPT>>>
`;

const transcript = fs.readFileSync('./transcript.txt', 'utf-8');
const segments = transcript.split(/\n(?=\d+\.\ds\s*-\s*\d+\.\ds:)/g);

const batches = Math.ceil(segments.length / batchSize);

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processBatch(i: number, batchSegments: string) {
    const prompt = promptTemplate.replace('<<<TRANSCRIPT>>>', batchSegments);

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`Batch ${i + 1} attempt ${attempt}...`);

            const response = await openai.chat.completions.create({
                model: modelName,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.0
            });

            const content = response.choices[0].message.content?.trim();
            if (!content) throw new Error('Empty response content');

            // 保存raw response
            fs.writeFileSync(`./batches/batch_${i + 1}.json`, content, 'utf-8');

            console.log(`✅ Batch ${i + 1} completed and saved.`);
            return;
        } catch (err) {
            console.error(`⚠️ Batch ${i + 1} attempt ${attempt} failed:`, err);

            if (attempt < 3) {
                console.log('Retrying after 5 seconds...');
                await sleep(5000);
            } else {
                console.log('❌ Max retry reached, skipping this batch.');
            }
        }
    }
}

async function run() {
    console.log(`Total batches: ${batches}`);

    for (let i = 0; i < batches; i++) {
        const batchPath = `./batches/batch_${i + 1}.json`;

        // 断点续跑机制
        if (fs.existsSync(batchPath)) {
            console.log(`⏭ Batch ${i + 1} already exists, skipping...`);
            continue;
        }

        const batchSegments = segments.slice(i * batchSize, (i + 1) * batchSize).join('\n');
        await processBatch(i, batchSegments);

        // 可选延时，避免 API 速率限制
        await sleep(1000);
    }

    // 拼接所有 batch
    console.log('🔄 Merging all batches...');
    let allResults: any[] = [];

    for (let i = 0; i < batches; i++) {
        const batchPath = `./batches/batch_${i + 1}.json`;

        if (fs.existsSync(batchPath)) {
            try {
                const content = fs.readFileSync(batchPath, 'utf-8');
                const batchResult = JSON.parse(content);
                allResults.push(...batchResult);
            } catch (err) {
                console.error(`❌ Failed to parse batch ${i + 1}, skipping...`, err);
            }
        } else {
            console.warn(`⚠️ Batch ${i + 1} not found, skipping...`);
        }
    }

    // 保存最终结果
    fs.writeFileSync('./output.json', JSON.stringify(allResults, null, 2), 'utf-8');
    console.log('✅ All done! Final output written to output.json');
}

run();
