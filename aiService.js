// ==========================================
// aiService.js - خدمة الذكاء الاصطناعي
// ==========================================
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// ==========================================
// تحليل أداء الطالب
// ==========================================
async function analyzeStudentPerformance(studentData) {
  try {
    const { submissions, skillScores, weakSkills } = studentData;

    const prompt = `
أنت خبير تربوي متخصص في مهارات القرن 21. قم بتحليل أداء الطالب التالي:

## بيانات الطالب:
- عدد المهام المنجزة: ${submissions.length}
- المهارات الضعيفة: ${weakSkills.join(', ')}
- متوسط الدرجات: ${JSON.stringify(skillScores)}

## المطلوب:
1. تحليل شامل لأداء الطالب
2. تحديد نقاط القوة والضعف بدقة
3. شرح السبب وراء ضعف كل مهارة
4. اقتراحات عملية للتحسين

قدم التحليل بصيغة JSON بهذا الشكل:
{
  "overallAnalysis": "تحليل عام",
  "strengths": ["قوة 1", "قوة 2"],
  "weaknesses": [
    {
      "skill": "اسم المهارة",
      "reason": "سبب الضعف",
      "suggestions": ["اقتراح 1", "اقتراح 2"]
    }
  ],
  "futureProjection": "توقع الأداء المستقبلي"
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // تنظيف الاستجابة وتحويلها لـ JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'فشل في تحليل البيانات' };
  } catch (error) {
    console.error('AI Analysis Error:', error);
    return { error: error.message };
  }
}

// ==========================================
// توليد توصيات ذكية
// ==========================================
async function generateRecommendations(skillName, currentLevel, studentHistory) {
  try {
    const prompt = `
أنت مستشار تعليمي ذكي. الطالب ضعيف في مهارة "${skillName}" بمستوى ${currentLevel}%.

## تاريخ المهام السابقة:
${studentHistory.map(h => `- ${h.taskTitle}: ${h.score}%`).join('\n')}

## المطلوب:
1. تشخيص دقيق لسبب الضعف
2. 5 أنشطة عملية لتحسين المهارة
3. 3 مصادر تعليمية (كورسات/كتب/فيديوهات)
4. خطة تطوير لمدة 7 أيام و 30 يوم

قدم الإجابة بصيغة JSON:
{
  "diagnosis": "التشخيص",
  "activities": ["نشاط 1", "نشاط 2", ...],
  "resources": [
    {
      "title": "اسم المصدر",
      "type": "course/book/video",
      "url": "الرابط",
      "duration": "المدة"
    }
  ],
  "developmentPlan": {
    "week": ["يوم 1", "يوم 2", ...],
    "month": ["أسبوع 1", "أسبوع 2", ...]
  }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'فشل في توليد التوصيات' };
  } catch (error) {
    console.error('AI Recommendations Error:', error);
    return { error: error.message };
  }
}

// ==========================================
// تقييم جودة المهمة (JCSEE Standards)
// ==========================================
async function evaluateTaskQuality(taskData) {
  try {
    const { taskDescription, questions, studentSubmission } = taskData;

    const prompt = `
أنت خبير في معايير JCSEE لتقييم جودة أدوات التقييم. قيّم المهمة التالية:

## وصف المهمة:
${taskDescription}

## الأسئلة:
${questions.join('\n')}

## حل الطالب:
${studentSubmission}

## المطلوب:
قيّم المهمة بناءً على معايير JCSEE التالية:
1. Utility (الفائدة): هل المهمة مفيدة لقياس المهارات؟
2. Feasibility (الجدوى): هل المهمة قابلة للتنفيذ؟
3. Propriety (الملاءمة): هل المهمة عادلة ومناسبة؟
4. Accuracy (الدقة): هل المهمة دقيقة في القياس؟

قدم التقييم بصيغة JSON:
{
  "scores": {
    "utility": 85,
    "feasibility": 90,
    "propriety": 80,
    "accuracy": 88
  },
  "overallQuality": 86,
  "feedback": "ملاحظات عامة",
  "improvements": ["تحسين 1", "تحسين 2"]
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'فشل في تقييم المهمة' };
  } catch (error) {
    console.error('AI Task Evaluation Error:', error);
    return { error: error.message };
  }
}

// ==========================================
// تقييم تلقائي لحل الطالب
// ==========================================
async function autoGradeSubmission(taskData, submission) {
  try {
    const prompt = `
أنت معلم خبير. قيّم حل الطالب التالي بناءً على مهارات القرن 21:

## المهمة:
${taskData.description}

## الأسئلة:
${taskData.questions.join('\n')}

## إجابة الطالب:
${submission.content}

## المطلوب:
قيّم الإجابة على المهارات التالية (0-100):
- Communication (التواصل)
- Critical Thinking (التفكير النقدي)
- Creativity (الإبداع)
- Collaboration (التعاون)
- Problem Solving (حل المشكلات)

قدم التقييم بصيغة JSON:
{
  "skillScores": {
    "communication": 85,
    "criticalThinking": 78,
    "creativity": 65,
    "collaboration": 90,
    "problemSolving": 82
  },
  "overallScore": 80,
  "feedback": "ملاحظات مفصلة",
  "recommendations": ["توصية 1", "توصية 2"]
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'فشل في تقييم الحل' };
  } catch (error) {
    console.error('AI Grading Error:', error);
    return { error: error.message };
  }
}

module.exports = {
  analyzeStudentPerformance,
  generateRecommendations,
  evaluateTaskQuality,
  autoGradeSubmission
};