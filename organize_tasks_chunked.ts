import OpenAI from 'openai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const modelName = process.env.MODEL || 'gpt-4o';

const chunkSize = 300; // 每chunk 300句
const overlapSentencesCount = 30; // overlap 30句，提供上下文缓冲区

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {

    if (!fs.existsSync('./batches')) {
        fs.mkdirSync('./batches', { recursive: true });
        console.log('📂 Created batches/ directory');
    }

    console.log('🔄 Loading flat sentences...');

    const flatSentences = JSON.parse(fs.readFileSync('./output.json', 'utf-8'));

    console.log(`✅ Loaded ${flatSentences.length} sentences.`);

    const totalChunks = Math.ceil(flatSentences.length / chunkSize);

    let allTasks = [];

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {

        const startIndex = Math.max(0, chunkIndex * chunkSize - overlapSentencesCount);
        const endIndex = Math.min(flatSentences.length, (chunkIndex + 1) * chunkSize);

        const chunkSentences = flatSentences.slice(startIndex, endIndex);

        console.log(`🚀 Sending chunk ${chunkIndex + 1}/${totalChunks} → sentences ${startIndex} ~ ${endIndex}`);

        const systemPrompt = `
你是一个教学内容分析助手，负责将课堂转录文本组织成三层结构的 JSON 数据，层次如下：

1️⃣ 第一层是 Task（教学任务），通常一节课有 3~5 个任务，代表教学内容的自然模块。
2️⃣ 每个 Task 下，细分为多个 Event，代表教学环节，比如“教师讲解”、“学生提问回答”、“转场过渡”、“课堂讨论”、“实验观察”等。
3️⃣ 每个 Event 下是若干句子（含时间、角色判断），表示具体语音内容。

如果发现当前段落内容是前一个 Task / Event 的延续，可以继续生成对应 Task / Event，不要强行新建 Task / Event。

最终输出格式为严格的 JSON，示例如下：

[
  {
    "task_title": "Task 的标题（自动归纳）",
    "events": [
      {
        "event_type": "事件类型（如教师讲解、互动提问、转场过渡等）",
        "summary": "这段教学活动的大意简要概述",
        "sentences": [
          { "start": 0.0, "end": 4.0, "text": "...", "speaker_probabilities": {"teacher": 1.0, "student": 0.0} },
          ...
        ]
      }
    ]
  }
]

注意事项：
- Task 与 Event 的划分请根据内容语义自动判断，不能按固定长度或固定时间切段。
- Event 类型尽量明确具体，不要用“未知”或“其他”。
- 保留每句的时间戳和说话人角色推断。
- 最终只输出符合上述格式的 JSON，不要添加解释或注释。
`;

        const userPrompt = `以下是课堂的 sentences 列表（JSON array）：

\`\`\`json
${JSON.stringify(chunkSentences, null, 2)}
\`\`\`

请根据上述规则组织成 3 层结构的 JSON，严格遵循格式要求。`;

        const response = await openai.chat.completions.create({
            model: modelName,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: userPrompt
                }
            ],
            temperature: 0.0
        });

        const content = response.choices[0].message.content?.trim();

        if (!content) {
            throw new Error('Empty response content');
        }

        fs.writeFileSync(`./batches/task_chunk_${chunkIndex + 1}.json.raw.txt`, content, 'utf-8');

        const cleanedJson = extractJson(content);

        try {
            const parsed = JSON.parse(cleanedJson);
            fs.writeFileSync(`./batches/task_chunk_${chunkIndex + 1}.json`, JSON.stringify(parsed, null, 2), 'utf-8');

            allTasks.push(...parsed);

            console.log(`✅ Chunk ${chunkIndex + 1} saved.`);
        } catch (err) {
            console.error(`❌ Failed to parse chunk ${chunkIndex + 1}:`, err);
        }

        await sleep(1000); // 防止 API 速率超限
    }

    // 最终 merge 所有 chunks → output_tasks.json
    fs.writeFileSync('./output_tasks.json', JSON.stringify(allTasks, null, 2), 'utf-8');
    console.log('🎉 All chunks merged. Final tasks structure saved to output_tasks.json');
}

function extractJson(content: string): string {
    const match = content.match(/```json\s*([\s\S]*?)```/);

    if (match && match[1]) {
        return match[1].trim();
    }

    const genericMatch = content.match(/```[\s\S]*?([\s\S]*?)```/);
    if (genericMatch && genericMatch[1]) {
        return genericMatch[1].trim();
    }

    return content
        .replace(/^```json\s*/, '')
        .replace(/^```\s*/, '')
        .replace(/```$/, '')
        .trim();
}

run();
