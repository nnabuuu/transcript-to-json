import * as fs from 'fs';
import * as path from 'path';

const tasks = JSON.parse(fs.readFileSync('./output_tasks.json', 'utf-8'));

const lines: string[] = [];

lines.push('# 课堂结构报告');
lines.push('');

tasks.forEach((task: any, taskIndex: number) => {
    lines.push(`## 教学任务 ${taskIndex + 1}：${task.task_title}`);
    lines.push('');

    task.events.forEach((event: any, eventIndex: number) => {
        lines.push(`### 教学环节 ${eventIndex + 1}：${event.event_type}`);
        lines.push(`**环节概述：** ${event.summary}`);
        lines.push('');

        event.sentences.forEach((sentence: any) => {
            const speaker = sentence.speaker_probabilities.teacher > sentence.speaker_probabilities.student ? '教师' : '学生';
            lines.push(`- [${sentence.start}s - ${sentence.end}s] **${speaker}**：${sentence.text}`);
        });

        lines.push(''); // 空行分隔 event
    });

    lines.push(''); // 空行分隔 task
});

// 保存成 md
const reportPath = path.resolve('./output_tasks_report.md');
fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');

console.log(`✅ 报告已生成：${reportPath}`);
