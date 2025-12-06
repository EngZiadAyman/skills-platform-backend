const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// 🔒 CORS Configuration (FIXED & SECURE)
// ==========================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://skills-platform-frontend-khuum6q10.vercel.app'
];

// Add your Vercel domain if different
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
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
// 🔌 Database & AI Setup
// ==========================================
let supabase;
let model;

try {
  // Validate environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('❌ SUPABASE_URL and SUPABASE_KEY are required!');
  }
  
  if (!process.env.GOOGLE_AI_KEY) {
    console.warn('⚠️ GOOGLE_AI_KEY not found - AI features will be disabled');
  }

  // Initialize Supabase
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  console.log('✅ Supabase connected');

  // Initialize Google AI
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
// 🏠 ROOT & HEALTH CHECK
// ==========================================
app.get('/', (req, res) => {
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
    uptime: process.uptime(),
    memory: process.memoryUsage()
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
    
    if (error) {
      console.error('School creation error:', error);
      throw error;
    }
    
    res.json({ success: true, school: data });
  } catch (error) {
    console.error('Schools API error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message || 'فشل في إنشاء المدرسة' 
    });
  }
});

// ==========================================
// 🔐 AUTH API
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, full_name, role, school_code } = req.body;

    // Validation
    if (!email || !full_name || !role || !school_code) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة' 
      });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        error: 'البريد الإلكتروني غير صحيح' 
      });
    }

    // Find school
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('id, name')
      .eq('code', school_code)
      .single();

    if (schoolError || !school) {
      return res.status(404).json({ 
        success: false, 
        error: 'كود المدرسة غير صحيح' 
      });
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'البريد الإلكتروني مسجل مسبقاً' 
      });
    }

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email,
        full_name,
        role,
        school_id: school.id,
        created_at: new Date().toISOString()
      })
      .select('*, schools(name)')
      .single();

    if (error) {
      console.error('User creation error:', error);
      throw error;
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Register error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message || 'فشل في إنشاء الحساب' 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'البريد الإلكتروني مطلوب' 
      });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        error: 'البريد الإلكتروني غير صحيح' 
      });
    }
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*, schools(name)')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ 
        success: false, 
        error: 'المستخدم غير موجود' 
      });
    }
    
    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ في تسجيل الدخول' 
    });
  }
});

// ==========================================
// 📋 TASKS API
// ==========================================
app.get('/api/tasks/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Get user's school
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('school_id')
      .eq('id', studentId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ 
        success: false, 
        error: 'الطالب غير موجود' 
      });
    }

    // Get tasks for this school
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        *,
        teacher:users!tasks_teacher_id_fkey(full_name),
        submissions!left(id, status, submitted_at, student_id)
      `)
      .eq('school_id', user.school_id)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('Tasks fetch error:', tasksError);
      throw tasksError;
    }

    // Filter submissions for this student
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
    console.error('Student tasks error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في تحميل المهام' 
    });
  }
});

app.get('/api/tasks/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        *,
        submissions(id, status, student_id)
      `)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Teacher tasks error:', error);
      throw error;
    }

    const tasksWithStats = (tasks || []).map(task => ({
      ...task,
      total_submissions: task.submissions?.length || 0,
      graded: task.submissions?.filter(s => s.status === 'graded').length || 0,
      pending: task.submissions?.filter(s => s.status === 'submitted').length || 0
    }));

    res.json({ success: true, tasks: tasksWithStats });
  } catch (error) {
    console.error('Teacher tasks error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في تحميل المهام' 
    });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { teacher_id, title, description, questions, due_date } = req.body;

    // Validation
    if (!teacher_id || !title || !description || !due_date) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة' 
      });
    }

    // Get teacher's school
    const { data: teacher, error: teacherError } = await supabase
      .from('users')
      .select('school_id, role')
      .eq('id', teacher_id)
      .single();

    if (teacherError || !teacher) {
      return res.status(404).json({ 
        success: false, 
        error: 'المعلم غير موجود' 
      });
    }

    if (teacher.role !== 'teacher') {
      return res.status(403).json({ 
        success: false, 
        error: 'غير مصرح لك بإنشاء مهام' 
      });
    }

    // Create task
    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        teacher_id,
        school_id: teacher.school_id,
        title,
        description,
        questions: questions || [],
        due_date,
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Task creation error:', error);
      throw error;
    }
    
    res.json({ success: true, task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في إنشاء المهمة' 
    });
  }
});

app.patch('/api/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'cancelled'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'الحالة غير صحيحة' 
      });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      console.error('Task update error:', error);
      throw error;
    }
    
    res.json({ success: true, task: data });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في تحديث المهمة' 
    });
  }
});

// ==========================================
// 📝 SUBMISSIONS API
// ==========================================
app.post('/api/submissions', async (req, res) => {
  try {
    const { task_id, student_id, content, files } = req.body;

    // Validation
    if (!task_id || !student_id || !content) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة' 
      });
    }

    // Check if already submitted
    const { data: existing } = await supabase
      .from('submissions')
      .select('id')
      .eq('task_id', task_id)
      .eq('student_id', student_id)
      .single();

    if (existing) {
      return res.status(400).json({ 
        success: false, 
        error: 'تم رفع الحل مسبقاً لهذه المهمة' 
      });
    }

    const { data: submission, error } = await supabase
      .from('submissions')
      .insert({
        task_id,
        student_id,
        content,
        files: files || [],
        status: 'submitted',
        submitted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Submission error:', error);
      throw error;
    }
    
    res.json({ success: true, submission });
  } catch (error) {
    console.error('Create submission error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في رفع الحل' 
    });
  }
});

app.get('/api/submissions/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const { data: submissions, error } = await supabase
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

    if (error) {
      console.error('Submissions fetch error:', error);
      throw error;
    }

    res.json({ success: true, submissions: submissions || [] });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في تحميل الحلول' 
    });
  }
});

// ==========================================
// 📊 PERFORMANCE API
// ==========================================
app.get('/api/performance/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Get all graded submissions with assessments
    const { data: submissions, error } = await supabase
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

    if (error) {
      console.error('Performance fetch error:', error);
      throw error;
    }

    // Calculate skill averages
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

    // Performance over time
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
    console.error('Performance error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في تحميل الأداء' 
    });
  }
});

// ==========================================
// 🤖 AI API
// ==========================================
app.post('/api/ai/grade-submission', async (req, res) => {
  try {
    if (!model) {
      return res.status(503).json({ 
        success: false, 
        error: 'خدمة الذكاء الاصطناعي غير متاحة' 
      });
    }

    const { submissionId } = req.body;

    if (!submissionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'معرف الحل مطلوب' 
      });
    }

    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .select('*, tasks(*)')
      .eq('id', submissionId)
      .single();

    if (subError || !submission) {
      return res.status(404).json({ 
        success: false, 
        error: 'الحل غير موجود' 
      });
    }

    const prompt = `
قيّم هذا الحل للطالب بناءً على مهارات القرن 21:

المهمة: ${submission.tasks.title}
الوصف: ${submission.tasks.description}
حل الطالب: ${submission.content}

قيّم المهارات التالية من 0-100:
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

    if (!grading) {
      throw new Error('فشل في تحليل التقييم');
    }

    // Save assessment
    const { data: assessment, error: assessError } = await supabase
      .from('assessments')
      .insert({
        submission_id: submissionId,
        overall_score: grading.overall_score,
        feedback: grading.feedback,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (assessError) {
      console.error('Assessment save error:', assessError);
      throw assessError;
    }

    // Get skills
    const { data: skills } = await supabase.from('skills').select('*');
    
    const skillAssessments = (skills || []).map(skill => ({
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
    console.error('AI grading error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'فشل في التقييم التلقائي' 
    });
  }
});

app.post('/api/ai/recommendations', async (req, res) => {
  try {
    if (!model) {
      return res.status(503).json({ 
        success: false, 
        error: 'خدمة الذكاء الاصطناعي غير متاحة' 
      });
    }

    const { studentId, taskId } = req.body;

    if (!studentId || !taskId) {
      return res.status(400).json({ 
        success: false, 
        error: 'معرف الطالب والمهمة مطلوبان' 
      });
    }

    const { data: performance, error: perfError } = await supabase
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

    if (perfError) {
      console.error('Performance fetch error:', perfError);
      throw perfError;
    }

    const weakSkills = [];
    performance?.assessments?.[0]?.skill_assessments?.forEach(sa => {
      if (parseFloat(sa.score) < 70) {
        weakSkills.push(sa.skills.name_ar);
      }
    });

    if (weakSkills.length === 0) {
      return res.json({
        success: true,
        recommendations: {
          diagnosis: 'أداء ممتاز! لا توجد نقاط ضعف واضحة',
          activities: ['استمر في التفوق', 'ساعد زملاءك'],
          resources: [],
          week_plan: [],
          month_plan: []
        }
      });
    }

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
    console.error('AI recommendations error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في توليد التوصيات' 
    });
  }
});

// ==========================================
// ❌ 404 Handler
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    message: 'الرجاء التحقق من صحة الرابط'
  });
});

// ==========================================
// ⚠️ Error Handler
// ==========================================
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    success: false,
    error: 'حدث خطأ في الخادم',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==========================================
// 🚀 Start Server
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('✅ Server running successfully!');
  console.log('='.repeat(50));
  console.log(`🌐 Port: ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔒 CORS allowed origins:`, allowedOrigins.length);
  console.log(`🤖 AI Status: ${model ? 'Enabled ✅' : 'Disabled ❌'}`);
  console.log('='.repeat(50));
});
