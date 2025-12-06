const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://skills-platform-frontend-khuum6q10.vercel.app'
    ];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
    credentials: true
}));
app.use(express.json());

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// ==========================================
// 🏠 ROOT & HEALTH CHECK
// ==========================================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Skills Platform API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      tasks: '/api/tasks/*',
      submissions: '/api/submissions/*',
      performance: '/api/performance/*',
      ai: '/api/ai/*'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running', timestamp: new Date().toISOString() });
});

// ==========================================
// 🏫 SCHOOLS API
// ==========================================
app.post('/api/schools', async (req, res) => {
  try {
    const { name, code } = req.body;
    const { data, error } = await supabase
      .from('schools')
      .insert({ name, code })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ success: true, school: data });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 🔐 AUTH API
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, full_name, role, school_code } = req.body;

    // Find school
    const { data: school } = await supabase
      .from('schools')
      .select('id, name')
      .eq('code', school_code)
      .single();

    if (!school) {
      return res.status(404).json({ success: false, error: 'المدرسة غير موجودة' });
    }

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email,
        full_name,
        role,
        school_id: school.id
      })
      .select('*, schools(name)')
      .single();

    if (error) throw error;
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*, schools(name)')
      .eq('email', email)
      .single();

    if (error) throw error;
    
    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
  }
});

// ==========================================
// 📋 TASKS API
// ==========================================
app.get('/api/tasks/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const { data: user } = await supabase
      .from('users')
      .select('school_id')
      .eq('id', studentId)
      .single();

    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        *,
        teacher:users!tasks_teacher_id_fkey(full_name),
        submissions!left(id, status, submitted_at, student_id)
      `)
      .eq('school_id', user.school_id)
      .order('created_at', { ascending: false });

    // Filter submissions for this student
    const tasksWithStatus = tasks.map(task => {
      const studentSubmission = task.submissions.find(s => s.student_id === studentId);
      return {
        ...task,
        submission_status: studentSubmission?.status || 'pending',
        submission_id: studentSubmission?.id || null,
        submissions: undefined
      };
    });

    res.json({ success: true, tasks: tasksWithStatus });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/tasks/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        *,
        submissions(id, status, student_id)
      `)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    const tasksWithStats = tasks.map(task => ({
      ...task,
      total_submissions: task.submissions.length,
      graded: task.submissions.filter(s => s.status === 'graded').length,
      pending: task.submissions.filter(s => s.status === 'submitted').length
    }));

    res.json({ success: true, tasks: tasksWithStats });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { teacher_id, title, description, questions, due_date } = req.body;

    const { data: teacher } = await supabase
      .from('users')
      .select('school_id')
      .eq('id', teacher_id)
      .single();

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        teacher_id,
        school_id: teacher.school_id,
        title,
        description,
        questions,
        due_date,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, task });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.patch('/api/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    const { data, error } = await supabase
      .from('tasks')
      .update({ status })
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, task: data });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 📝 SUBMISSIONS API
// ==========================================
app.post('/api/submissions', async (req, res) => {
  try {
    const { task_id, student_id, content, files } = req.body;

    const { data: submission, error } = await supabase
      .from('submissions')
      .insert({
        task_id,
        student_id,
        content,
        files: files || [],
        status: 'submitted'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, submission });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/submissions/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const { data: submissions } = await supabase
      .from('submissions')
      .select(`
        *,
        student:users!submissions_student_id_fkey(id, full_name, email),
        assessments(
          overall_score,
          feedback,
          skill_assessments(
            score,
            skills(name_en, name_ar)
          )
        )
      `)
      .eq('task_id', taskId)
      .order('submitted_at', { ascending: false });

    res.json({ success: true, submissions });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 📊 PERFORMANCE API
// ==========================================
app.get('/api/performance/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Get all submissions with assessments
    const { data: submissions } = await supabase
      .from('submissions')
      .select(`
        id,
        submitted_at,
        tasks(title),
        assessments(
          overall_score,
          skill_assessments(
            score,
            skills(id, name_en, name_ar)
          )
        )
      `)
      .eq('student_id', studentId)
      .eq('status', 'graded')
      .order('submitted_at', { ascending: true });

    // Calculate skill averages
    const skillsMap = {};
    let totalScore = 0;
    let totalCount = 0;

    submissions?.forEach(sub => {
      sub.assessments?.forEach(assessment => {
        totalScore += parseFloat(assessment.overall_score || 0);
        totalCount++;
        
        assessment.skill_assessments?.forEach(sa => {
          const skill = sa.skills.name_en;
          if (!skillsMap[skill]) {
            skillsMap[skill] = {
              name_en: sa.skills.name_en,
              name_ar: sa.skills.name_ar,
              scores: [],
              total: 0,
              count: 0
            };
          }
          const score = parseFloat(sa.score);
          skillsMap[skill].scores.push(score);
          skillsMap[skill].total += score;
          skillsMap[skill].count++;
        });
      });
    });

    const skillsPerformance = Object.values(skillsMap).map(skill => ({
      skill: skill.name_en,
      skill_ar: skill.name_ar,
      average: (skill.total / skill.count).toFixed(1),
      trend: skill.scores.length > 1 ? 
        (skill.scores[skill.scores.length - 1] > skill.scores[0] ? 'up' : 'down') : 'stable'
    }));

    // Performance over time
    const performanceOverTime = submissions?.map(sub => ({
      date: new Date(sub.submitted_at).toLocaleDateString('ar-EG'),
      task: sub.tasks.title,
      score: sub.assessments?.[0]?.overall_score || 0
    })) || [];

    res.json({
      success: true,
      overall_average: totalCount > 0 ? (totalScore / totalCount).toFixed(1) : 0,
      total_tasks: submissions?.length || 0,
      skills_performance: skillsPerformance,
      performance_over_time: performanceOverTime,
      strengths: skillsPerformance.filter(s => parseFloat(s.average) >= 80).slice(0, 3),
      weaknesses: skillsPerformance.filter(s => parseFloat(s.average) < 70).slice(0, 3)
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 🤖 AI API
// ==========================================
app.post('/api/ai/grade-submission', async (req, res) => {
  try {
    const { submissionId } = req.body;

    const { data: submission } = await supabase
      .from('submissions')
      .select('*, tasks(*)')
      .eq('id', submissionId)
      .single();

    const prompt = `
قيِّم هذا الحل للطالب بناءً على مهارات القرن 21:

المهمة: ${submission.tasks.title}
الوصف: ${submission.tasks.description}
حل الطالب: ${submission.content}

قيِّم المهارات التالية من 0-100:
- Communication (التواصل)
- Critical Thinking (التفكير النقدي)  
- Creativity (الإبداع)
- Collaboration (التعاون)
- Problem Solving (حل المشكلات)

أعط الرد بصيغة JSON فقط:
{
  "communication": 85,
  "critical_thinking": 78,
  "creativity": 90,
  "collaboration": 75,
  "problem_solving": 82,
  "overall_score": 82,
  "feedback": "ملاحظات مفصلة بالعربي"
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const grading = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!grading) throw new Error('فشل التقييم');

    // Save assessment
    const { data: assessment } = await supabase
      .from('assessments')
      .insert({
        submission_id: submissionId,
        overall_score: grading.overall_score,
        feedback: grading.feedback
      })
      .select()
      .single();

    // Get skills
    const { data: skills } = await supabase.from('skills').select('*');
    
    const skillAssessments = skills.map(skill => ({
      assessment_id: assessment.id,
      skill_id: skill.id,
      score: grading[skill.name_en.toLowerCase().replace(' ', '_')] || 75
    }));

    await supabase.from('skill_assessments').insert(skillAssessments);

    // Update submission status
    await supabase
      .from('submissions')
      .update({ status: 'graded' })
      .eq('id', submissionId);

    res.json({ success: true, grading });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/recommendations', async (req, res) => {
  try {
    const { studentId, taskId } = req.body;

    const { data: performance } = await supabase
      .from('submissions')
      .select(`
        assessments(
          skill_assessments(
            score,
            skills(name_en, name_ar)
          )
        )
      `)
      .eq('student_id', studentId)
      .eq('task_id', taskId)
      .single();

    const weakSkills = [];
    performance?.assessments?.[0]?.skill_assessments?.forEach(sa => {
      if (parseFloat(sa.score) < 70) {
        weakSkills.push(sa.skills.name_ar);
      }
    });

    const prompt = `
أنت مستشار تعليمي. الطالب ضعيف في: ${weakSkills.join('، ')}

قدم توصيات بصيغة JSON:
{
  "diagnosis": "تشخيص بالعربي",
  "activities": ["نشاط 1", "نشاط 2", "نشاط 3"],
  "resources": [
    {"title": "كورس كذا", "type": "course", "url": "https://", "duration": "3 ساعات"}
  ],
  "week_plan": ["يوم 1: ...", "يوم 2: ..."],
  "month_plan": ["أسبوع 1: ...", "أسبوع 2: ..."]
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    res.json({ success: true, recommendations });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 404 Handler
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

