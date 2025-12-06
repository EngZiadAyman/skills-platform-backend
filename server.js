const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// 🔒 CORS Configuration
// ==========================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://skills-platform-frontend-khuum6q10.vercel.app'
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// ==========================================
// 📦 Serve Static Files (Frontend)
// ==========================================
// إذا كان عندك مجلد build من React
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
}

// ==========================================
// 🔌 Database & AI Setup
// ==========================================
let supabase;
let model;

try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('❌ SUPABASE_URL and SUPABASE_KEY are required!');
  }
  
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  console.log('✅ Supabase connected');

  if (process.env.GOOGLE_AI_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    console.log('✅ Google AI connected');
  }
} catch (error) {
  console.error('❌ Initialization error:', error.message);
  process.exit(1);
}

// ==========================================
// 🏠 API ROOT
// ==========================================
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Skills Platform API is running',
    version: '1.0.0',
    status: 'healthy',
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
  res.json({ 
    status: 'OK', 
    message: 'Server is running', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ==========================================
// 🏫 SCHOOLS API
// ==========================================
app.post('/api/schools', async (req, res) => {
  try {
    const { name, code } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ 
        success: false, 
        error: 'اسم المدرسة والكود مطلوبان' 
      });
    }

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

    if (!email || !full_name || !role || !school_code) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة' 
      });
    }

    const { data: school } = await supabase
      .from('schools')
      .select('id, name')
      .eq('code', school_code)
      .single();

    if (!school) {
      return res.status(404).json({ success: false, error: 'كود المدرسة غير صحيح' });
    }

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
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'البريد الإلكتروني مطلوب' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*, schools(name)')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
    }
    
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'حدث خطأ في تسجيل الدخول' });
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

    if (!user) {
      return res.status(404).json({ success: false, error: 'الطالب غير موجود' });
    }

    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        *,
        teacher:users!tasks_teacher_id_fkey(full_name),
        submissions!left(id, status, submitted_at, student_id)
      `)
      .eq('school_id', user.school_id)
      .order('created_at', { ascending: false });

    const tasksWithStatus = (tasks || []).map(task => {
      const studentSubmission = task.submissions?.find(s => s.student_id === studentId);
      return {
        ...task,
        submission_status: studentSubmission?.status || 'pending',
        submission_id: studentSubmission?.id || null,
        submissions: undefined
      };
    });

    res.json({ success: true, tasks: tasksWithStatus });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في تحميل المهام' });
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

    const tasksWithStats = (tasks || []).map(task => ({
      ...task,
      total_submissions: task.submissions?.length || 0,
      graded: task.submissions?.filter(s => s.status === 'graded').length || 0,
      pending: task.submissions?.filter(s => s.status === 'submitted').length || 0
    }));

    res.json({ success: true, tasks: tasksWithStats });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في تحميل المهام' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { teacher_id, title, description, questions, due_date } = req.body;

    if (!teacher_id || !title || !description || !due_date) {
      return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
    }

    const { data: teacher } = await supabase
      .from('users')
      .select('school_id, role')
      .eq('id', teacher_id)
      .single();

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بإنشاء مهام' });
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        teacher_id,
        school_id: teacher.school_id,
        title,
        description,
        questions: questions || [],
        due_date,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في إنشاء المهمة' });
  }
});

app.patch('/api/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'الحالة غير صحيحة' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ status })
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, task: data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في تحديث المهمة' });
  }
});

// ==========================================
// 📝 SUBMISSIONS API
// ==========================================
app.post('/api/submissions', async (req, res) => {
  try {
    const { task_id, student_id, content, files } = req.body;

    if (!task_id || !student_id || !content) {
      return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
    }

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
    res.status(500).json({ success: false, error: 'فشل في رفع الحل' });
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

    res.json({ success: true, submissions: submissions || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في تحميل الحلول' });
  }
});

// ==========================================
// 📊 PERFORMANCE API
// ==========================================
app.get('/api/performance/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
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

    const skillsMap = {};
    let totalScore = 0;
    let totalCount = 0;

    (submissions || []).forEach(sub => {
      sub.assessments?.forEach(assessment => {
        const score = parseFloat(assessment.overall_score || 0);
        totalScore += score;
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
          const skillScore = parseFloat(sa.score);
          skillsMap[skill].scores.push(skillScore);
          skillsMap[skill].total += skillScore;
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

    const performanceOverTime = (submissions || []).map(sub => ({
      date: new Date(sub.submitted_at).toLocaleDateString('ar-EG'),
      task: sub.tasks?.title || 'مهمة',
      score: sub.assessments?.[0]?.overall_score || 0
    }));

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
    res.status(500).json({ success: false, error: 'فشل في تحميل الأداء' });
  }
});

// ==========================================
// 🤖 AI API
// ==========================================
app.post('/api/ai/grade-submission', async (req, res) => {
  try {
    if (!model) {
      return res.status(503).json({ success: false, error: 'خدمة الذكاء الاصطناعي غير متاحة' });
    }

    const { submissionId } = req.body;
    if (!submissionId) {
      return res.status(400).json({ success: false, error: 'معرف الحل مطلوب' });
    }

    const { data: submission } = await supabase
      .from('submissions')
      .select('*, tasks(*)')
      .eq('id', submissionId)
      .single();

    if (!submission) {
      return res.status(404).json({ success: false, error: 'الحل غير موجود' });
    }

    const prompt = `قيّم هذا الحل: ${submission.tasks.title}\n${submission.content}\n\nأعط JSON فقط بهذا الشكل:\n{"communication": 85, "critical_thinking": 78, "creativity": 90, "collaboration": 75, "problem_solving": 82, "overall_score": 82, "feedback": "ملاحظات"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const grading = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!grading) throw new Error('فشل التقييم');

    const { data: assessment } = await supabase
      .from('assessments')
      .insert({
        submission_id: submissionId,
        overall_score: grading.overall_score,
        feedback: grading.feedback
      })
      .select()
      .single();

    const { data: skills } = await supabase.from('skills').select('*');
    const skillAssessments = (skills || []).map(skill => ({
      assessment_id: assessment.id,
      skill_id: skill.id,
      score: grading[skill.name_en.toLowerCase().replace(' ', '_')] || 75
    }));

    await supabase.from('skill_assessments').insert(skillAssessments);
    await supabase.from('submissions').update({ status: 'graded' }).eq('id', submissionId);

    res.json({ success: true, grading });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في التقييم' });
  }
});

app.post('/api/ai/recommendations', async (req, res) => {
  try {
    if (!model) {
      return res.status(503).json({ success: false, error: 'خدمة الذكاء الاصطناعي غير متاحة' });
    }

    const { studentId, taskId } = req.body;
    if (!studentId || !taskId) {
      return res.status(400).json({ success: false, error: 'معرف الطالب والمهمة مطلوبان' });
    }

    const { data: performance } = await supabase
      .from('submissions')
      .select(`assessments(skill_assessments(score, skills(name_ar)))`)
      .eq('student_id', studentId)
      .eq('task_id', taskId)
      .single();

    const weakSkills = [];
    performance?.assessments?.[0]?.skill_assessments?.forEach(sa => {
      if (parseFloat(sa.score) < 70) weakSkills.push(sa.skills.name_ar);
    });

    if (weakSkills.length === 0) {
      return res.json({
        success: true,
        recommendations: {
          diagnosis: 'أداء ممتاز!',
          activities: ['استمر في التفوق'],
          resources: [],
          week_plan: [],
          month_plan: []
        }
      });
    }

    const prompt = `الطالب ضعيف في: ${weakSkills.join('، ')}\n\nقدم توصيات JSON:\n{"diagnosis": "...", "activities": ["..."], "resources": [{"title": "...", "type": "course", "url": "...", "duration": "..."}], "week_plan": ["..."], "month_plan": ["..."]}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    res.json({ success: true, recommendations });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في التوصيات' });
  }
});

// ==========================================
// 🌐 Serve React App (Production Only)
// ==========================================
if (process.env.NODE_ENV === 'production') {
  // All other routes should serve the React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

// ==========================================
// ❌ 404 Handler (Development)
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// ==========================================
// 🚀 Start Server
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('✅ Server running!');
  console.log(`🌐 Port: ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 AI: ${model ? 'Enabled ✅' : 'Disabled ❌'}`);
  console.log('='.repeat(50));
});
